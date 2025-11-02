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


class MarketData(Base):
    """
    Multi-timescale candlestick data stored in TimescaleDB hypertable.
    
    This table is converted to a TimescaleDB hypertable partitioned by time,
    enabling efficient storage and querying of large time-series datasets.
    Supports multiple timescales (1min, 5min, 15min, 1hour, 1day) in a single table.
    
    Attributes:
        time: Bar timestamp (UTC with timezone)
        symbol: Ticker symbol (e.g., 'AAPL', 'TSLA')
        timescale: Granularity ('1min', '5min', '15min', '1hour', '1day')
        open: Opening price for the bar
        high: Highest price during the bar
        low: Lowest price during the bar
        close: Closing price for the bar
        volume: Trading volume (number of shares)
        vwap: Volume-weighted average price
        trade_count: Number of trades during the bar
        session_type: Trading session ('regular', 'pre', 'after')
    """
    __tablename__ = "market_data"
    
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
    timescale: Mapped[str] = mapped_column(
        String(10),
        primary_key=True,
        nullable=False,
        default='1min'
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
        return f"<MarketData(symbol={self.symbol}, timescale={self.timescale}, time={self.time}, close={self.close})>"


class SymbolDateValidation(Base):
    """
    Tracks data completeness for each symbol on each trading date at each timescale.
    
    This table answers: "For symbol X on date Y at timescale Z, do we have complete bar data?"
    
    Attributes:
        symbol: Ticker symbol
        date: Trading date being validated
        timescale: Granularity ('1min', '5min', '15min', '1hour', '1day')
        is_complete: True if we have all expected bars for this date
        bar_count: Actual number of bars stored
        expected_bars: Expected bar count (varies by timescale)
        first_bar_time: Timestamp of first bar for this symbol/date/timescale
        last_bar_time: Timestamp of last bar for this symbol/date/timescale
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
    timescale: Mapped[str] = mapped_column(
        String(10),
        primary_key=True,
        nullable=False,
        default='1min'
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
        return f"<SymbolDateValidation(symbol={self.symbol}, date={self.date}, timescale={self.timescale}, is_complete={self.is_complete})>"


class MarketLatestTrade(Base):
    """
    Latest trade data from Polygon snapshots for real-time pricing.
    
    Stores the most recent trade for each symbol, updated every 5 seconds
    from Polygon snapshot API. This provides sub-minute price data between
    official 1-minute bars.
    
    Attributes:
        symbol: Ticker symbol (primary key)
        price: Last trade price
        timestamp: When the trade occurred (from Polygon)
        size: Trade size (number of shares)
        exchange: Exchange code where trade occurred
        conditions: Trade conditions/flags from Polygon
        updated_at: When we stored this record
    """
    __tablename__ = "market_latest_trades"
    
    symbol: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
        nullable=False
    )
    price: Mapped[float] = mapped_column(
        Numeric(12, 4),
        nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )
    size: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    exchange: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True
    )
    conditions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow
    )
    
    def __repr__(self) -> str:
        return f"<MarketLatestTrade(symbol={self.symbol}, price={self.price}, timestamp={self.timestamp})>"
