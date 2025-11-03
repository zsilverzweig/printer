"""
Fund and trading models.

Provides SQLAlchemy models for:
- Fund: Trading account with balance, mode, strategy configuration, and risk parameters
- ScreeningCriteria: Reusable screening configurations
- Order: Order tracking
- Transaction: Transaction ledger
"""

from datetime import datetime
from typing import Optional
import json

from sqlalchemy import String, Float, DateTime, Integer, Text, ForeignKey, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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
    max_order_age_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=60)
    
    # Position sizing
    size_per_trade: Mapped[float] = mapped_column(Float, nullable=False, default=1000.0)
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
    last_ai_cost_reset: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow,
        onupdate=datetime.utcnow
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
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow,
        onupdate=datetime.utcnow
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
    submitted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    filled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Fill details (from Alpaca when filled)
    filled_qty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    filled_avg_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow,
        onupdate=datetime.utcnow
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
    
    # Transaction details
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)  # buy/sell
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    total_value: Mapped[float] = mapped_column(Float, nullable=False)  # quantity * price
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    
    # Strategy tracking fields (for position management)
    high_water_mark: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    strategy_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # e.g., {"entry_reason": "breakout", "has_scaled_out": false, "scale_in_count": 0}
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
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
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True, default=datetime.utcnow)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
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
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    
    # Additional context
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )


