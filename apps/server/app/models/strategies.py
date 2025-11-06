"""
Fund and trading models.

Provides SQLAlchemy models for:
- Fund: Trading account with balance, mode, strategy configuration, and risk parameters
- ScreeningCriteria: Reusable screening configurations
- Order: Order tracking with trade_id
- Transaction: Transaction ledger with trade_id
- Trade: Master record for complete trades with performance metrics
"""

from datetime import datetime, timezone
from typing import Optional
import json

from sqlalchemy import String, Float, DateTime, Integer, Text, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow_aware() -> datetime:
    """Return timezone-aware UTC datetime for model defaults."""
    return datetime.now(timezone.utc)


def utcnow_naive() -> datetime:
    """
    Return timezone-naive UTC datetime for model defaults.
    
    Used for DateTime columns without timezone=True (TIMESTAMP WITHOUT TIME ZONE).
    Note: This function is deprecated - all datetime columns should use timezone-aware.
    """
    # Convert timezone-aware to naive for backward compatibility
    from app.services.core.time_context import get_current_time
    return get_current_time().replace(tzinfo=None)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class Fund(Base):
    """
    Trading fund/account.
    
    Represents a trading account with balance, mode (sim/real), strategy configuration,
    risk parameters, position sizing, and trading windows.
    """
    __tablename__ = "funds"
    
    # Basic fund info
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(10), nullable=False)  # 'sim' or 'real'
    balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="paused")  # 'active' or 'paused'
    archived: Mapped[bool] = mapped_column(nullable=False, default=False)  # Hide from main list
    
    # UI customization
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Lucide icon name
    icon_color: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # Tailwind color class
    ticker: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Display ticker (e.g., "5GUYS")
    emoji: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # Display emoji (e.g., "🍔")
    
    # Strategy configuration
    strategy_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # e.g., "monkey_darts"
    strategy_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    screening_criteria_id: Mapped[Optional[str]] = mapped_column(
        String(36), 
        ForeignKey("screening_criteria.id"), 
        nullable=True
    )
    
    # Risk parameters (nullable - None means no limit)
    max_loss_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_loss_dollars: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_giveback_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_order_age_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    
    # Position sizing
    size_per_trade: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    min_bet_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_bet_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_total_exposure: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    
    # Trading time windows
    trading_start_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # e.g., "09:30"
    trading_end_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)    # e.g., "16:00"
    timezone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)            # e.g., "America/New_York"
    
    # AI cost tracking
    total_ai_cost: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    ai_cost_mtd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # Month-to-date
    ai_cost_ytd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # Year-to-date
    last_ai_cost_reset: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )


class ScreeningCriteria(Base):
    """
    Reusable screening criteria configuration.
    
    Defines how to filter and find trading candidates from market data.
    Previously called "Setup" - renamed to better reflect its purpose.
    """
    __tablename__ = "screening_criteria"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # JSON configuration for screening parameters
    # e.g., {"minPrice": 5, "maxPrice": 100, "minVolume": 1000000, "relativeVolume": 2.0}
    criteria: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )


class Order(Base):
    """
    Track all orders submitted to Alpaca.
    
    Represents order lifecycle from submission through fill/cancel.
    Alpaca is the source of truth - this table syncs via polling.
    """
    __tablename__ = "orders"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    alpaca_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False, index=True)
    trade_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)  # Links to Trade record
    backtest_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)  # Links to Backtest record if from backtest
    
    # Order details
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # buy/sell
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)  # market/limit/stop
    estimated_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Price at order creation (for cash validation)
    
    # Order status (synced from Alpaca)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # Valid statuses: pending/filled/partially_filled/canceled/failed
    
    # Timing
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    filled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Fill details (from Alpaca when filled)
    filled_qty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    filled_avg_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )


class Transaction(Base):
    """
    Ledger of all order fills (buy/sell executions).
    
    Created when orders are filled. Provides complete trade history
    and maintains strategy-specific state per position.
    """
    __tablename__ = "transactions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("orders.id"), nullable=False, index=True)
    alpaca_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    alpaca_fill_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False, index=True)
    trade_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("trades.id"), nullable=True, index=True)  # Links to Trade record
    backtest_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)  # Links to Backtest record if from backtest
    
    # Transaction details
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # buy/sell
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    total_value: Mapped[float] = mapped_column(Float, nullable=False)  # quantity * price
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    
    # Strategy tracking fields (for position management)
    high_water_mark: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    strategy_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # e.g., {"entry_reason": "breakout", "has_scaled_out": false, "scale_in_count": 0}
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )


class Transfer(Base):
    """
    Fund transfers (deposits/withdrawals).
    
    Tracks capital additions and withdrawals from funds.
    """
    __tablename__ = "transfers"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False, index=True)
    
    # Transfer details
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    transfer_type: Mapped[str] = mapped_column(String(20), nullable=False)  # deposit/withdrawal
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True, default=utcnow_aware)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )


class Trade(Base):
    """
    Master record for a complete trade (open to close).
    
    Tracks the lifecycle of a position from entry through exit,
    with comprehensive performance metrics and strategy context.
    """
    __tablename__ = "trades"
    
    # Identification
    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # Same as trade_id in orders/transactions
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    backtest_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)  # Links to Backtest record if from backtest
    
    # Entry information
    entry_order_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("orders.id"), nullable=True)
    entry_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)  # Average entry price
    entry_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Exit information (nullable for open trades)
    exit_order_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("orders.id"), nullable=True)
    exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exit_quantity: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Strategy context
    strategy_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    screening_criteria_id: Mapped[Optional[str]] = mapped_column(
        String(36), 
        ForeignKey("screening_criteria.id"), 
        nullable=True,
        index=True
    )
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Performance metrics
    realized_pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Null until closed
    realized_pnl_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hold_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_adverse_excursion: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # MAE
    max_favorable_excursion: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # MFE
    commission_fees: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    
    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", index=True)
    # Valid statuses: 'open', 'closed', 'partial'
    
    # Additional context
    trade_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )


class Position(Base):
    """
    Current position for a symbol in a fund.
    
    Stores position state incrementally updated with each transaction.
    Replaces expensive FIFO calculations from transaction history.
    Linked to Trade that opened the position (nullable for orphaned positions).
    """
    __tablename__ = "positions"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    trade_id: Mapped[Optional[str]] = mapped_column(
        String(36), 
        ForeignKey("trades.id", ondelete="SET NULL"), 
        nullable=True,
        index=True
    )  # Links to Trade that opened this position (nullable for orphaned positions)
    
    # Position metrics (maintained incrementally)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)  # Current position quantity
    avg_entry_price: Mapped[float] = mapped_column(Float, nullable=False)  # FIFO average entry price
    cost_basis: Mapped[float] = mapped_column(Float, nullable=False)  # Total cost basis (quantity * avg_entry_price)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )
    
    # Unique constraint: one position per symbol per fund
    __table_args__ = (
        UniqueConstraint('fund_id', 'symbol', name='uq_positions_fund_symbol'),
    )


class AICost(Base):
    """
    AI service cost tracking.
    
    Records detailed usage of AI services (GPT calls) by funds for cost monitoring
    and performance impact analysis.
    """
    __tablename__ = "ai_costs"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False, index=True)
    
    # Context
    symbol: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, index=True)
    operation: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "entry_analysis", "stop_update"
    
    # Model and usage
    model: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "gpt-4o-mini"
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    cost: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Timing
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    
    # Additional context
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )


class DefaultRiskSettings(Base):
    """
    Default risk management settings for all funds.
    
    Provides default values that apply to all funds unless overridden by fund-specific settings.
    There should only be one record in this table (singleton pattern).
    """
    __tablename__ = "default_risk_settings"
    
    # Singleton - only one record with id = 'default'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default='default')
    
    # Risk parameters (nullable - None means no limit)
    max_loss_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_loss_dollars: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_giveback_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_order_age_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    
    # Position sizing
    size_per_trade: Mapped[float] = mapped_column(Float, nullable=False, default=1000.0)
    min_bet_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_bet_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    max_total_exposure: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )


class Backtest(Base):
    """
    Backtest execution record.
    
    Tracks backtesting of a fund's strategy against historical data for a specific date.
    All orders, transactions, and trades created during a backtest are linked via backtest_id.
    """
    __tablename__ = "backtests"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)  # Date being backtested
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running", index=True)
    # Valid statuses: 'running', 'completed', 'failed', 'cancelled'
    
    # Configuration snapshot (captures fund state at backtest time)
    fund_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # Snapshot of fund name
    strategy_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    strategy_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    screening_criteria_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    screening_criteria_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # Snapshot of screener name
    
    # Results
    starting_balance: Mapped[float] = mapped_column(Float, nullable=False)
    ending_balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Null until completed
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Null until completed
    total_pnl_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Execution stats
    total_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filled_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cancelled_orders: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Timing
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow_aware)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Additional metadata (renamed from 'metadata' to avoid SQLAlchemy reserved name)
    backtest_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )


class TickerState(Base):
    """
    Track ticker lifecycle state through the strategy execution pipeline.
    
    States: screened -> setup -> entered -> filled -> exited
    Also tracks removed tickers that drop out of screener.
    """
    __tablename__ = "ticker_states"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    current_state: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # 'screened', 'setup', 'entered', 'filled', 'exited', 'removed'
    
    # State transition history (array of transition records)
    state_transitions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    
    # Tracking fields
    last_screened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    entry_level_id: Mapped[Optional[str]] = mapped_column(
        String(36), 
        ForeignKey("strategy_monitoring_state.id", ondelete="SET NULL"), 
        nullable=True
    )
    trade_id: Mapped[Optional[str]] = mapped_column(
        String(36), 
        ForeignKey("trades.id", ondelete="SET NULL"), 
        nullable=True
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=utcnow_aware,
        onupdate=utcnow_aware
    )
    
    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            'id': self.id,
            'fund_id': self.fund_id,
            'ticker': self.ticker,
            'current_state': self.current_state,
            'state_transitions': self.state_transitions or [],
            'last_screened_at': self.last_screened_at.isoformat() if self.last_screened_at else None,
            'entry_level_id': self.entry_level_id,
            'trade_id': self.trade_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


