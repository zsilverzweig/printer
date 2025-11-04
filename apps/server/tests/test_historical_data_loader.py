"""
Tests for historical market data loading service.

Tests cover:
- Database stats retrieval
- Status creation and updates  
- Symbol data loading with mocked Polygon API
- Progress tracking and percentage calculations
- Error handling and recovery
- Task cancellation
- Field mapping consistency (processed_tickers vs tickers_processed)
- Custom symbol list validation
"""

import asyncio
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, AsyncMock
from decimal import Decimal

from app.models.assets import AssetLoadingStatus
from app.models.market_data import MarketData
from app.services.market.historical_data_loader import (
    start_historical_load_task,
    cancel_historical_load_task,
    get_load_status,
    get_database_stats,
    _update_status,
    _bulk_insert_bars,
    _load_symbol_data,
    detect_session_type,
)


@pytest_asyncio.fixture
async def clean_market_data(async_session, test_engine):
    """Clean market data tables before each test."""
    from sqlalchemy import delete, inspect
    from app.models.market_data import MarketData, Base as MarketDataBase
    from app.models.assets import AssetLoadingStatus, Base as AssetsBase
    from contextlib import asynccontextmanager
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
    import app.services.core.database as db_module
    import app.services.market.historical_data_loader as historical_loader
    
    # Ensure tables exist
    async with test_engine.begin() as conn:
        await conn.run_sync(MarketDataBase.metadata.create_all)
        await conn.run_sync(AssetsBase.metadata.create_all)
    
    # Patch get_async_session to use test database
    test_session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    @asynccontextmanager
    async def override_get_async_session():
        async with test_session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()
    
    original_db_func = db_module.get_async_session
    original_loader_func = historical_loader.get_async_session
    
    db_module.get_async_session = override_get_async_session
    historical_loader.get_async_session = override_get_async_session
    
    # Delete using SQLAlchemy ORM delete statements
    try:
        await async_session.execute(delete(MarketData))
        await async_session.execute(delete(AssetLoadingStatus))
        await async_session.commit()
    except Exception:
        await async_session.rollback()
    
    yield
    
    # Cleanup after test
    try:
        await async_session.execute(delete(MarketData))
        await async_session.execute(delete(AssetLoadingStatus))
        await async_session.commit()
    except Exception:
        await async_session.rollback()
    
    # Restore original functions
    db_module.get_async_session = original_db_func
    historical_loader.get_async_session = original_loader_func


class TestDatabaseStats:
    """Test database statistics retrieval."""
    
    @pytest.mark.asyncio
    async def test_get_database_stats_empty(self, clean_market_data):
        """Test stats with empty database."""
        stats = await get_database_stats()
        
        assert stats["total_bars"] == 0
        assert stats["symbol_count"] == 0
        assert stats["min_date"] is None
        assert stats["max_date"] is None
        assert "total_size" in stats
        assert "table_size" in stats
    
    @pytest.mark.asyncio
    async def test_get_database_stats_with_data(self, async_session, clean_market_data):
        """Test stats with sample data."""
        # Insert test data
        now = datetime.now(timezone.utc)
        bars = [
            MarketData(
                time=now - timedelta(hours=i),
                symbol=f"TEST{i % 3}",  # 3 unique symbols
                open=100.0,
                high=101.0,
                low=99.0,
                close=100.5,
                volume=10000,
                vwap=100.3,
                trade_count=100,
                session_type="regular"
            )
            for i in range(10)
        ]
        
        async_session.add_all(bars)
        await async_session.commit()
        
        # Get stats
        stats = await get_database_stats()
        
        assert stats["total_bars"] == 10
        assert stats["symbol_count"] == 3
        assert stats["min_date"] is not None
        assert stats["max_date"] is not None


class TestStatusManagement:
    """Test loading status creation and updates."""
    
    @pytest.mark.asyncio
    async def test_create_status(self, async_session, clean_market_data):
        """Test creating a new loading status."""
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0,
            processed_tickers=0,
            tickers_succeeded=0,
            failed_tickers=0
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        
        assert status.id is not None
        assert status.status == "running"
        assert status.progress_pct == 0.0
        assert status.processed_tickers == 0
    
    @pytest.mark.asyncio
    async def test_update_status_progress(self, async_session, clean_market_data):
        """Test updating status with progress."""
        # Create initial status
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        status_id = status.id
        
        # Update progress
        await _update_status(
            status_id,
            progress_pct=50.0,
            tickers_processed=5,
            tickers_succeeded=4,
            tickers_failed=1
        )
        
        # Verify update
        result = await get_load_status(status_id)
        assert result is not None
        assert result["progress_pct"] == 50.0
        assert result["tickers_processed"] == 5
        assert result["tickers_succeeded"] == 4
        assert result["tickers_failed"] == 1
    
    @pytest.mark.asyncio
    async def test_update_status_completion(self, async_session, clean_market_data):
        """Test marking status as completed."""
        # Create initial status
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        status_id = status.id
        
        # Mark completed
        await _update_status(
            status_id,
            status="completed",
            progress_pct=100.0,
            tickers_processed=10,
            tickers_succeeded=10,
            tickers_failed=0
        )
        
        # Verify completion
        result = await get_load_status(status_id)
        assert result["status"] == "completed"
        assert result["progress_pct"] == 100.0
        assert result["completed_at"] is not None
    
    @pytest.mark.asyncio
    async def test_update_status_with_error(self, async_session, clean_market_data):
        """Test updating status with error message."""
        # Create initial status
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        status_id = status.id
        
        # Update with error
        error_msg = "Failed to fetch data from Polygon"
        await _update_status(
            status_id,
            status="failed",
            error_message=error_msg
        )
        
        # Verify error
        result = await get_load_status(status_id)
        assert result["status"] == "failed"
        assert result["error_message"] == error_msg
        assert result["completed_at"] is not None


class TestFieldMapping:
    """Test field name consistency between database and API."""
    
    @pytest.mark.asyncio
    async def test_field_names_in_get_load_status(self, async_session, clean_market_data):
        """Verify get_load_status maps database fields correctly to API response."""
        # Create status with all fields
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=75.0,
            processed_tickers=75,  # DB field name
            tickers_succeeded=70,
            failed_tickers=5  # DB field name
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        
        # Get status via API function
        result = await get_load_status(status.id)
        
        # Verify API uses consistent field names
        assert "tickers_processed" in result  # API field name
        assert "tickers_succeeded" in result
        assert "tickers_failed" in result  # API field name
        assert result["tickers_processed"] == 75
        assert result["tickers_succeeded"] == 70
        assert result["tickers_failed"] == 5
        assert result["progress_pct"] == 75.0


class TestBulkInsert:
    """Test bulk bar insertion."""
    
    @pytest.mark.asyncio
    async def test_bulk_insert_bars(self, async_session, clean_market_data):
        """Test inserting multiple bars at once."""
        now = datetime.now(timezone.utc)
        bars = [
            MarketData(
                time=now - timedelta(minutes=i),
                symbol="AAPL",
                open=150.0 + i,
                high=151.0 + i,
                low=149.0 + i,
                close=150.5 + i,
                volume=10000,
                vwap=150.3 + i,
                trade_count=100,
                session_type="regular"
            )
            for i in range(5)
        ]
        
        await _bulk_insert_bars(bars)
        
        # Verify insertion
        result = await async_session.execute(
            "SELECT COUNT(*) FROM market_data_minute WHERE symbol = 'AAPL'"
        )
        count = result.scalar()
        assert count == 5
    
    @pytest.mark.asyncio
    async def test_bulk_insert_conflict_handling(self, async_session, clean_market_data):
        """Test that duplicate bars are ignored (ON CONFLICT DO NOTHING)."""
        now = datetime.now(timezone.utc)
        bar = MarketData(
            time=now,
            symbol="TSLA",
            open=200.0,
            high=201.0,
            low=199.0,
            close=200.5,
            volume=10000,
            vwap=200.3,
            trade_count=100,
            session_type="regular"
        )
        
        # Insert same bar twice
        await _bulk_insert_bars([bar])
        await _bulk_insert_bars([bar])  # Should not raise error
        
        # Verify only one bar exists
        result = await async_session.execute(
            "SELECT COUNT(*) FROM market_data_minute WHERE symbol = 'TSLA'"
        )
        count = result.scalar()
        assert count == 1


class TestSessionDetection:
    """Test trading session type detection."""
    
    def test_detect_session_type(self):
        """Test session type detection (currently returns 'regular' for all)."""
        # Note: Current implementation always returns 'regular'
        # This test documents the expected behavior
        
        now = datetime.now(timezone.utc)
        session_type = detect_session_type(now)
        
        # Current implementation
        assert session_type == "regular"
        
        # TODO: When proper timezone handling is implemented, update this test


class TestCustomSymbolList:
    """Test that custom symbol lists are respected."""
    
    @pytest.mark.asyncio
    async def test_custom_symbols_only_queries_specified_symbols(self, async_session, clean_market_data):
        """Test that providing a custom symbol list only queries those symbols, not the entire snapshot."""
        from unittest.mock import patch, Mock, AsyncMock
        from datetime import datetime, timezone, timedelta
        
        # Mock the Polygon API to track which symbols are queried
        queried_symbols = []
        
        def mock_list_aggs(ticker, **kwargs):
            queried_symbols.append(ticker)
            # Return some fake data
            mock_agg = Mock()
            mock_agg.timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
            mock_agg.open = 100.0
            mock_agg.high = 101.0
            mock_agg.low = 99.0
            mock_agg.close = 100.5
            mock_agg.volume = 10000
            mock_agg.vwap = 100.3
            mock_agg.transactions = 100
            return [mock_agg]
        
        mock_client = Mock()
        mock_client.list_aggs = mock_list_aggs
        
        # Mock the core module to return our mock client
        with patch('app.services.market.historical_data_loader.core') as mock_core:
            mock_core.rest_client = mock_client
            
            # Start a load with custom symbols
            custom_symbols = ["AAPL", "TSLA", "GOOGL"]
            
            with patch('app.services.market.historical_data_loader.fetch_snapshot_all') as mock_snapshot:
                # Ensure fetch_snapshot_all is NEVER called when custom symbols provided
                mock_snapshot.return_value = []
                
                from app.services.market.historical_data_loader import start_historical_load_task, _current_task
                
                # Start load with custom symbols
                result = await start_historical_load_task(days=1, symbols=custom_symbols)
                status_id = result["status_id"]
                
                # Wait for task to complete (with timeout)
                if _current_task:
                    try:
                        await asyncio.wait_for(_current_task, timeout=10)
                    except asyncio.TimeoutError:
                        pass
                
                # Verify snapshot was NOT queried
                mock_snapshot.assert_not_called()
                
                # Verify only custom symbols were queried
                assert set(queried_symbols) == set(custom_symbols), \
                    f"Expected only {custom_symbols}, but queried {queried_symbols}"
                
                # Verify each symbol was queried exactly once
                assert len(queried_symbols) == len(custom_symbols), \
                    f"Expected {len(custom_symbols)} queries, got {len(queried_symbols)}"


class TestMockedPolygonData:
    """Test symbol loading with mocked Polygon API."""
    
    @pytest.mark.asyncio
    async def test_load_symbol_data_success(self, async_session, clean_market_data):
        """Test successfully loading data for a symbol."""
        # Mock Polygon aggregate
        mock_agg = Mock()
        mock_agg.timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        mock_agg.open = 100.0
        mock_agg.high = 101.0
        mock_agg.low = 99.0
        mock_agg.close = 100.5
        mock_agg.volume = 10000
        mock_agg.vwap = 100.3
        mock_agg.transactions = 100
        
        # Mock client
        mock_client = Mock()
        mock_client.list_aggs = Mock(return_value=[mock_agg])
        
        # Test loading
        start_date = datetime.now(timezone.utc) - timedelta(days=1)
        end_date = datetime.now(timezone.utc)
        semaphore = AsyncMock()
        semaphore.__aenter__ = AsyncMock()
        semaphore.__aexit__ = AsyncMock()
        
        await _load_symbol_data(mock_client, "TEST", start_date, end_date, semaphore)
        
        # Verify data was inserted
        result = await async_session.execute(
            "SELECT COUNT(*) FROM market_data_minute WHERE symbol = 'TEST'"
        )
        count = result.scalar()
        assert count == 1
    
    @pytest.mark.asyncio
    async def test_load_symbol_data_empty_response(self, async_session, clean_market_data):
        """Test handling empty response from Polygon."""
        mock_client = Mock()
        mock_client.list_aggs = Mock(return_value=[])
        
        start_date = datetime.now(timezone.utc) - timedelta(days=1)
        end_date = datetime.now(timezone.utc)
        semaphore = AsyncMock()
        semaphore.__aenter__ = AsyncMock()
        semaphore.__aexit__ = AsyncMock()
        
        # Should not raise error
        await _load_symbol_data(mock_client, "EMPTY", start_date, end_date, semaphore)
        
        # Verify no data was inserted
        result = await async_session.execute(
            "SELECT COUNT(*) FROM market_data_minute WHERE symbol = 'EMPTY'"
        )
        count = result.scalar()
        assert count == 0


class TestProgressCalculation:
    """Test progress percentage calculations."""
    
    @pytest.mark.asyncio
    async def test_progress_calculation_accuracy(self, async_session, clean_market_data):
        """Test that progress percentage is calculated correctly."""
        # Create status
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        status_id = status.id
        
        # Simulate processing 23 out of 100 symbols
        processed = 23
        total = 100
        progress_pct = (processed / total) * 100
        
        await _update_status(
            status_id,
            progress_pct=progress_pct,
            tickers_processed=processed
        )
        
        result = await get_load_status(status_id)
        assert result["progress_pct"] == pytest.approx(23.0, rel=0.01)
        assert result["tickers_processed"] == 23


class TestErrorHandling:
    """Test error handling and recovery."""
    
    @pytest.mark.asyncio
    async def test_multiple_failed_symbols(self, async_session, clean_market_data):
        """Test tracking multiple failed symbols."""
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0
        )
        async_session.add(status)
        await async_session.commit()
        await async_session.refresh(status)
        status_id = status.id
        
        # Update with failures
        await _update_status(
            status_id,
            progress_pct=100.0,
            tickers_processed=10,
            tickers_succeeded=7,
            tickers_failed=3,
            error_message="Failed symbols: ABC, DEF, GHI"
        )
        
        result = await get_load_status(status_id)
        assert result["tickers_failed"] == 3
        assert result["tickers_succeeded"] == 7
        assert "Failed symbols" in result["error_message"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

