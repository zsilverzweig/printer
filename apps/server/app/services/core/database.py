"""
Database connection and session management for PostgreSQL.

Provides async database engine and session management using SQLAlchemy 2.0.
Also provides sync session support for legacy code compatibility.
"""

import logging
import os
from contextlib import asynccontextmanager, contextmanager
from typing import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import Session, sessionmaker

from app.models.assets import Base

logger = logging.getLogger("app.database")

# Global async engine instance
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None

# Global sync engine instance (for legacy code)
_sync_engine = None
_sync_session_factory: sessionmaker[Session] | None = None


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
    
    logger.debug(f"Initializing database engine: {database_url.split('@')[-1] if '@' in database_url else 'localhost'}")
    
    _engine = create_async_engine(
        database_url,
        echo=False,  # Set to True for SQL query logging during development
        pool_pre_ping=True,  # Verify connections before using them
        pool_size=50,  # Increased for high-throughput backfill operations
        max_overflow=100,  # Allow bursts up to 150 total connections
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
    
    # Create tables silently
    try:
        async with engine.begin() as conn:
            # Create all tables defined in Base metadata
            await conn.run_sync(Base.metadata.create_all)
        
    except Exception as e:
        logger.error(f"❌ Failed to create database tables: {e}")
        raise


def get_sync_engine():
    """
    Get or create the sync database engine.
    
    Creates a synchronous engine from the same DATABASE_URL.
    Used for legacy code that requires sync sessions.
    
    Returns:
        Engine instance (sync)
    """
    global _sync_engine
    
    if _sync_engine is not None:
        return _sync_engine
    
    database_url = os.getenv("DATABASE_URL")
    
    if not database_url:
        raise ValueError(
            "DATABASE_URL environment variable is not set. "
            "Please configure PostgreSQL connection string in env.local"
        )
    
    # Convert asyncpg URL to psycopg2 for sync engine
    sync_url = database_url.replace("+asyncpg", "").replace("postgresql+asyncpg://", "postgresql://")
    
    logger.info(f"Initializing sync database engine: {sync_url.split('@')[-1] if '@' in sync_url else 'localhost'}")
    
    _sync_engine = create_engine(
        sync_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )
    
    return _sync_engine


def get_sync_session_factory() -> sessionmaker[Session]:
    """
    Get or create the sync session factory.
    
    Returns:
        sessionmaker instance for creating sync database sessions
    """
    global _sync_session_factory
    
    if _sync_session_factory is not None:
        return _sync_session_factory
    
    engine = get_sync_engine()
    _sync_session_factory = sessionmaker(
        bind=engine,
        class_=Session,
        expire_on_commit=False,
    )
    
    return _sync_session_factory


@contextmanager
def get_sync_session() -> Generator[Session, None, None]:
    """
    Context manager for sync database sessions.
    
    Usage:
        with get_sync_session() as session:
            # Use session here
            result = session.execute(query)
            session.commit()
    
    Yields:
        Session instance (sync)
    """
    session_factory = get_sync_session_factory()
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


async def close_db() -> None:
    """
    Close the database engine and clean up connections.
    
    Should be called on application shutdown.
    """
    global _engine, _session_factory, _sync_engine, _sync_session_factory
    
    if _engine is not None:
        logger.info("Closing database connections...")
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Async database connections closed")
    
    if _sync_engine is not None:
        _sync_engine.dispose()
        _sync_engine = None
        _sync_session_factory = None
        logger.info("Sync database connections closed")

