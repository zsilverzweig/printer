"""
Database connection and session management for PostgreSQL.

Provides async database engine and session management using SQLAlchemy 2.0.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine, async_sessionmaker

from app.models.events import Base

logger = logging.getLogger("app.database")

# Global engine instance
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_async_engine() -> AsyncEngine:
    """
    Get or create the async database engine.
    
    Reads DATABASE_URL from environment and creates an async engine.
    Fails loudly if DATABASE_URL is not set.
    
    Returns:
        AsyncEngine instance
        
    Raises:
        ValueError: If DATABASE_URL is not set
    """
    global _engine
    
    if _engine is not None:
        return _engine
    
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        raise ValueError(
            "DATABASE_URL environment variable is not set. "
            "Please configure PostgreSQL connection string in env.local"
        )
    
    logger.info(f"Initializing database engine: {database_url.split('@')[-1] if '@' in database_url else 'localhost'}")
    
    _engine = create_async_engine(
        database_url,
        echo=False,  # Set to True for SQL query logging during development
        pool_pre_ping=True,  # Verify connections before using them
        pool_size=5,
        max_overflow=10,
    )
    
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """
    Get or create the async session factory.
    
    Returns:
        async_sessionmaker instance for creating database sessions
    """
    global _session_factory
    
    if _session_factory is not None:
        return _session_factory
    
    engine = get_async_engine()
    _session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    return _session_factory


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for database sessions.
    
    Usage:
        async with get_async_session() as session:
            # Use session here
            result = await session.execute(query)
            await session.commit()
    
    Yields:
        AsyncSession instance
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Initialize the database by creating all tables.
    
    Creates tables defined in Base metadata. This should be called
    on application startup.
    
    Raises:
        Exception: If database connection or table creation fails
    """
    engine = get_async_engine()
    
    logger.info("Creating database tables...")
    
    try:
        async with engine.begin() as conn:
            # Create all tables defined in Base metadata
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("✅ Database tables created successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to create database tables: {e}")
        raise


async def close_db() -> None:
    """
    Close the database engine and clean up connections.
    
    Should be called on application shutdown.
    """
    global _engine, _session_factory
    
    if _engine is not None:
        logger.info("Closing database connections...")
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Database connections closed")

