"""
Strategy Monitoring State Model

Persistent storage for entry/exit levels being monitored by strategies.
Allows recovery from outages and ensures no levels are lost.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.models.strategies import Base


class StrategyMonitoringState(Base):
    """
    Persistent storage for strategy monitoring levels.
    
    Two types of monitoring state:
    1. Entry Levels: Price levels for candidates we're watching
    2. Exit Levels: Stop/target levels for open positions
    
    This table survives restarts and allows full recovery of monitoring state.
    """
    __tablename__ = 'strategy_monitoring_state'
    
    # Primary identification
    id = Column(String, primary_key=True)
    fund_id = Column(String, ForeignKey('funds.id', ondelete='CASCADE'), nullable=False)
    symbol = Column(String(10), nullable=False)
    state_type = Column(String(20), nullable=False)  # 'entry_level' or 'exit_level'
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Entry level fields (when state_type == 'entry_level')
    entry_price = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    order_type = Column(String(10), nullable=True)  # 'market', 'limit'
    limit_price = Column(Float, nullable=True)
    
    # Exit level fields (when state_type == 'exit_level')
    position_entry_price = Column(Float, nullable=True)
    position_entry_time = Column(DateTime(timezone=True), nullable=True)
    current_stop_loss = Column(Float, nullable=True)
    current_take_profit = Column(Float, nullable=True)
    trailing_stop_percent = Column(Float, nullable=True)
    high_water_mark = Column(Float, nullable=True)
    
    # Strategy-specific metadata (JSON for SQLite compatibility, JSONB for PostgreSQL)
    strategy_metadata = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True, server_default='{}')
    
    # Monitoring state
    is_active = Column(Boolean, nullable=False, server_default='true')
    last_price_check = Column(Float, nullable=True)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    
    # Audit trail
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    trigger_price = Column(Float, nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    deactivation_reason = Column(String(100), nullable=True)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses."""
        return {
            'id': self.id,
            'fund_id': self.fund_id,
            'symbol': self.symbol,
            'state_type': self.state_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            
            # Entry level fields
            'entry_price': self.entry_price,
            'stop_loss': self.stop_loss,
            'take_profit': self.take_profit,
            'confidence': self.confidence,
            'order_type': self.order_type,
            'limit_price': self.limit_price,
            
            # Exit level fields
            'position_entry_price': self.position_entry_price,
            'position_entry_time': self.position_entry_time.isoformat() if self.position_entry_time else None,
            'current_stop_loss': self.current_stop_loss,
            'current_take_profit': self.current_take_profit,
            'trailing_stop_percent': self.trailing_stop_percent,
            'high_water_mark': self.high_water_mark,
            
            # Metadata
            'strategy_metadata': self.strategy_metadata,
            'is_active': self.is_active,
            'last_price_check': self.last_price_check,
            'last_checked_at': self.last_checked_at.isoformat() if self.last_checked_at else None,
            
            # Audit
            'triggered_at': self.triggered_at.isoformat() if self.triggered_at else None,
            'trigger_price': self.trigger_price,
            'deactivated_at': self.deactivated_at.isoformat() if self.deactivated_at else None,
            'deactivation_reason': self.deactivation_reason,
        }
    
    def is_entry_level(self) -> bool:
        """Check if this is an entry level monitoring state."""
        return self.state_type == 'entry_level'
    
    def is_exit_level(self) -> bool:
        """Check if this is an exit level monitoring state."""
        return self.state_type == 'exit_level'
    
    def mark_triggered(self, price: float) -> None:
        """Mark this level as triggered."""
        self.triggered_at = datetime.utcnow()
        self.trigger_price = price
        self.is_active = False
    
    def deactivate(self, reason: str) -> None:
        """Deactivate this monitoring state."""
        self.deactivated_at = datetime.utcnow()
        self.deactivation_reason = reason
        self.is_active = False

