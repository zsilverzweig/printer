"""
Event models for tracking application events using SQLAlchemy.

Uses joined table inheritance pattern:
- Base Event table with common fields
- Specialized tables (AITradeEvent, AlpacaTradeEvent) with specific fields
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Float, DateTime, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class Event(Base):
    """
    Base event model for all application events.
    
    Fields:
        id: Primary key
        event_type: Discriminator for inheritance (e.g., 'ai_trade', 'alpaca_trade')
        timestamp: Event timestamp (business logic time)
        created_at: Database record creation time
    """
    __tablename__ = "events"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow
    )
    
    __mapper_args__ = {
        "polymorphic_on": "event_type",
        "polymorphic_identity": "event",
    }


class AITradeEvent(Event):
    """
    Event for AI trading analysis decisions.
    
    Tracks when the AI analyzes a stock and makes a trading recommendation,
    regardless of whether an actual trade is executed.
    
    Fields:
        ticker: Stock symbol analyzed
        action: AI recommendation (e.g., 'buy', 'hold', 'no_trade')
        confidence: Confidence score (0.0 to 1.0)
        reasoning: AI's textual explanation for the decision
        chart_data_present: Whether chart image was included in analysis
        news_data_present: Whether news summary was included
        financial_data_present: Whether financial data was included
    """
    __tablename__ = "ai_trade_events"
    
    id: Mapped[int] = mapped_column(Integer, ForeignKey("events.id"), primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chart_data_present: Mapped[bool] = mapped_column(Boolean, default=False)
    news_data_present: Mapped[bool] = mapped_column(Boolean, default=False)
    financial_data_present: Mapped[bool] = mapped_column(Boolean, default=False)
    
    __mapper_args__ = {
        "polymorphic_identity": "ai_trade",
    }


class AlpacaTradeEvent(Event):
    """
    Event for actual Alpaca trade executions.
    
    Tracks when an order is placed with Alpaca's API, including the order
    details and execution status.
    
    Fields:
        ticker: Stock symbol traded
        order_id: Alpaca order ID
        client_order_id: Alpaca client order ID
        side: 'buy' or 'sell'
        notional: Dollar amount of the order
        filled_qty: Number of shares filled
        filled_avg_price: Average fill price per share
        status: Order status (e.g., 'new', 'filled', 'cancelled')
        submitted_at: When order was submitted to Alpaca
        filled_at: When order was filled (if applicable)
        error_message: Error message if order failed
    """
    __tablename__ = "alpaca_trade_events"
    
    id: Mapped[int] = mapped_column(Integer, ForeignKey("events.id"), primary_key=True)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False)
    order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    client_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    notional: Mapped[float] = mapped_column(Float, nullable=False)
    filled_qty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    filled_avg_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    filled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    __mapper_args__ = {
        "polymorphic_identity": "alpaca_trade",
    }


class StrategyEngineEvent(Event):
    """
    Event for strategy engine decisions and state changes.
    
    Provides comprehensive audit trail of all engine activities including:
    - Position tracking (Alpaca vs ledger mismatches)
    - Order decisions (entry/exit signals)
    - Fill tracking (partial fills, lot details)
    - Risk checks and validations
    - Error conditions
    
    Fields:
        fund_id: UUID of the fund
        event_category: Category (e.g., 'position_sync', 'order_decision', 'fill_tracking', 'validation')
        symbol: Stock symbol (if applicable)
        event_data: JSON blob with detailed event data
        severity: Severity level ('info', 'warning', 'error')
        message: Human-readable message
    """
    __tablename__ = "strategy_engine_events"
    
    id: Mapped[int] = mapped_column(Integer, ForeignKey("events.id"), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(100), nullable=False)
    event_category: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    event_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    
    __mapper_args__ = {
        "polymorphic_identity": "strategy_engine",
    }

