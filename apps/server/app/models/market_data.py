"""
Market data models for TimescaleDB time-series storage.

Provides SQLAlchemy models for storing historical candlestick data
from Polygon API with 1-minute granularity and extended hours support.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, Numeric, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class MarketDataMinute(Base):
    """
    1-minute candlestick data stored in TimescaleDB hypertable.
    
    This table is converted to a TimescaleDB hypertable partitioned by time,
    enabling efficient storage and querying of large time-series datasets.
    
    Attributes:
        time: Bar timestamp (UTC with timezone)
        symbol: Ticker symbol (e.g., 'AAPL', 'TSLA')
        open: Opening price for the minute
        high: Highest price during the minute
        low: Lowest price during the minute
        close: Closing price for the minute
        volume: Trading volume (number of shares)
        vwap: Volume-weighted average price
        trade_count: Number of trades during the minute
        session_type: Trading session ('regular', 'pre', 'after')
    """
    __tablename__ = "market_data_minute"
    
    time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        primary_key=True,
        nullable=False
    )
    symbol: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
        nullable=False
    )
    open: Mapped[float] = mapped_column(
        Numeric(12, 4),
        nullable=False
    )
    high: Mapped[float] = mapped_column(
        Numeric(12, 4),
        nullable=False
    )
    low: Mapped[float] = mapped_column(
        Numeric(12, 4),
        nullable=False
    )
    close: Mapped[float] = mapped_column(
        Numeric(12, 4),
        nullable=False
    )
    volume: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False
    )
    vwap: Mapped[float | None] = mapped_column(
        Numeric(12, 4),
        nullable=True
    )
    trade_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    session_type: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default='regular'
    )
    
    def __repr__(self) -> str:
        return f"<MarketDataMinute(symbol={self.symbol}, time={self.time}, close={self.close})>"

