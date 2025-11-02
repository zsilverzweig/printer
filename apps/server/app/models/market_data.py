"""
Market data models for TimescaleDB time-series storage.

Provides SQLAlchemy models for storing historical candlestick data
from Polygon API with 1-minute granularity and extended hours support.
"""

from datetime import datetime, date

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Integer, Numeric, String, Text
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


class SymbolDateValidation(Base):
    """
    Tracks data completeness for each symbol on each trading date.
    
    This table answers: "For symbol X on date Y, do we have complete minute bar data?"
    
    Attributes:
        symbol: Ticker symbol
        date: Trading date being validated
        is_complete: True if we have all expected bars for this date
        bar_count: Actual number of minute bars stored
        expected_bars: Expected bar count (~390 for regular hours, ~810 for extended)
        first_bar_time: Timestamp of first bar for this symbol/date
        last_bar_time: Timestamp of last bar for this symbol/date
        validated_at: When this record was last validated
        notes: Any issues or notes about the data
    """
    __tablename__ = "symbol_date_validation"
    
    symbol: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
        nullable=False
    )
    date: Mapped[date] = mapped_column(
        Date,
        primary_key=True,
        nullable=False
    )
    is_complete: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False
    )
    bar_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0
    )
    expected_bars: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    first_bar_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    last_bar_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    validated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )
    
    def __repr__(self) -> str:
        return f"<SymbolDateValidation(symbol={self.symbol}, date={self.date}, is_complete={self.is_complete})>"
