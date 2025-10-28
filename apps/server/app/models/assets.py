"""
Asset models for storing ticker details and loading status.

Provides SQLAlchemy models for:
- TickerDetails: Comprehensive ticker information from Polygon + Alpaca
- AssetLoadingStatus: Progress tracking for background loading tasks
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import String, Float, DateTime, Integer, Boolean, Text, BigInteger, Date, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class TickerDetails(Base):
    """
    Comprehensive ticker details from Polygon Ticker Details API + Alpaca Asset API.
    
    Stores all fields shown in the TCC Financial Info Panel plus additional
    metadata for advanced screening and filtering capabilities.
    """
    __tablename__ = "ticker_details"
    
    # Primary key
    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    
    # Polygon Ticker Details API fields
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    market: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    locale: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    primary_exchange: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    active: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    currency_name: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cik: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sic_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    sic_description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    # Financial metrics
    market_cap: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    share_class_shares_outstanding: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    weighted_shares_outstanding: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    total_employees: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    list_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    
    # Contact information
    homepage_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    phone_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Address fields
    address_line1: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    address_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address_state: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address_postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    
    # Additional metadata
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    icon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Alpaca tradability flags
    tradable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    marginable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    shortable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    easy_to_borrow: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    fractionable: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    
    # Metadata
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
    
    # Indexes for common filtering operations
    __table_args__ = (
        Index('idx_ticker_details_exchange', 'primary_exchange'),
        Index('idx_ticker_details_type', 'type'),
        Index('idx_ticker_details_market_cap', 'market_cap'),
        Index('idx_ticker_details_active', 'active'),
        Index('idx_ticker_details_tradable', 'tradable'),
        Index('idx_ticker_details_market_locale', 'market', 'locale'),
    )


class AssetLoadingStatus(Base):
    """
    Tracks progress of background asset loading tasks.
    
    Used by the admin UI to show real-time progress and handle
    task management (start, cancel, resume).
    """
    __tablename__ = "asset_loading_status"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Task status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="idle")
    # Valid statuses: "idle", "running", "completed", "failed", "cancelled"
    
    # Progress tracking
    total_tickers: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    processed_tickers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_tickers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Current phase
    current_phase: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Valid phases: "listing_tickers", "loading_polygon", "loading_alpaca"
    
    # Error handling
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime, 
        nullable=False, 
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
    
    # Index for status queries
    __table_args__ = (
        Index('idx_asset_loading_status', 'status'),
    )
