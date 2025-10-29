"""
Strategy models for fund management and position tracking.

Provides SQLAlchemy models for:
- Fund: Trading account with balance and mode
- ScreeningCriteria: Reusable screening configurations
- Strategy: Complete trading strategy for a fund
- PositionContext: Active position state tracking
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
    
    Represents a trading account with its own balance, mode (sim/real),
    and associated strategy configuration.
    """
    __tablename__ = "funds"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(10), nullable=False)  # 'sim' or 'real'
    balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="paused")  # 'active' or 'paused'
    
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


class Strategy(Base):
    """
    Complete trading strategy for a fund.
    
    References:
    - ExecutionStrategy (code plugin like "bull_flag")
    - ScreeningCriteria (reusable screening config)
    
    Contains risk parameters, position sizing, and execution configuration.
    """
    __tablename__ = "strategies"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False)
    
    # References to execution components
    execution_strategy_id: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "bull_flag"
    screening_criteria_id: Mapped[Optional[str]] = mapped_column(
        String(36), 
        ForeignKey("screening_criteria.id"), 
        nullable=True
    )
    
    # Risk parameters
    max_loss_percent: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    max_loss_dollars: Mapped[float] = mapped_column(Float, nullable=False, default=1000.0)
    max_giveback_percent: Mapped[float] = mapped_column(Float, nullable=False, default=50.0)
    
    # Position sizing
    size_per_trade: Mapped[float] = mapped_column(Float, nullable=False, default=1000.0)
    min_bet_percent: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    max_bet_percent: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    max_total_exposure: Mapped[float] = mapped_column(Float, nullable=False, default=10000.0)
    
    # Trading time windows
    trading_start_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # e.g., "09:30"
    trading_end_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)    # e.g., "16:00"
    timezone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)            # e.g., "America/New_York"
    
    # Strategy-specific configuration (JSON)
    # e.g., {"macd_threshold": 0.5, "pullback_ratio": 0.25, "profit_take_percent": 25}
    execution_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
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


class PositionContext(Base):
    """
    Active position state tracking.
    
    Maintains state and history for an open trading position,
    including strategy-specific tracking data.
    """
    __tablename__ = "position_contexts"
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    fund_id: Mapped[str] = mapped_column(String(36), ForeignKey("funds.id"), nullable=False)
    strategy_id: Mapped[str] = mapped_column(String(36), ForeignKey("strategies.id"), nullable=False)
    
    # Position details
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    entry_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    
    # Alpaca integration
    position_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # Alpaca position ID
    
    # Exit tracking
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    exit_reason: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Performance
    realized_pnl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    high_water_mark: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Strategy-specific state (JSON)
    # e.g., {"flag_high": 150.25, "flag_low": 148.50, "has_scaled_out": false}
    strategy_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    
    # Status tracking
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    # Valid statuses: "open", "closed", "error"
    
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


