"""
Pytest configuration and shared fixtures.
"""
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from unittest.mock import Mock
import uuid

from app.main import app
from app.models.strategies import Base, Fund, ScreeningCriteria, Order, Transaction


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)


@pytest.fixture
async def async_client():
    """Async HTTP client fixture for testing async endpoints."""
    async with AsyncClient(base_url="http://test") as ac:
        yield ac


@pytest.fixture
def sample_market_data():
    """Sample market data for testing."""
    return {
        "symbol": "AAPL",
        "price": 150.0,
        "volume": 1000000,
        "timestamp": "2024-01-01T00:00:00Z"
    }


@pytest.fixture
def sample_portfolio():
    """Sample portfolio data for testing."""
    return {
        "id": "test-portfolio",
        "name": "Test Portfolio",
        "positions": [
            {"symbol": "AAPL", "quantity": 100, "avg_price": 150.0},
            {"symbol": "GOOGL", "quantity": 50, "avg_price": 2800.0}
        ]
    }


# Database testing fixtures
@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create a test database engine using file-based SQLite database."""
    import tempfile
    import os
    
    # Create a temporary file for the test database
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(db_fd)
    
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        echo=False,
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Cleanup
    await engine.dispose()
    
    # Remove the temporary database file
    try:
        os.unlink(db_path)
    except Exception:
        pass


@pytest_asyncio.fixture
async def async_session(test_engine):
    """Create an async database session for testing."""
    # Create session bound to the test engine  
    async with AsyncSession(test_engine, expire_on_commit=False) as session:
        # Start a transaction
        await session.begin()
        
        yield session
        
        # Rollback to clean up any changes made during the test
        await session.rollback()


# Mock services for testing
class MockMarketDataProvider:
    """Mock market data provider for testing."""
    
    async def get_latest_bars(self, symbols, timeframe="1Min"):
        """Return mock bar data."""
        return {symbol: Mock(close=100.0, volume=1000000) for symbol in symbols}
    
    async def get_quote(self, symbol):
        """Return mock quote data."""
        return Mock(
            symbol=symbol,
            bid_price=99.0,
            ask_price=101.0,
            bid_size=100,
            ask_size=100
        )


class MockAlpacaService:
    """Mock Alpaca service for testing."""
    
    def __init__(self, paper_trading=True):
        self.orders = {}
        self.positions = {}
        self.paper_trading = paper_trading
        
    async def place_order(self, symbol, side, quantity, order_type="market", time_in_force="day"):
        """Mock placing an order."""
        from datetime import datetime
        order_id = str(uuid.uuid4())
        alpaca_order = Mock(
            id=order_id,
            client_order_id=str(uuid.uuid4()),
            symbol=symbol,
            side=side.upper(),
            qty=quantity,
            order_type=order_type.upper(),
            time_in_force=time_in_force.upper(),
            status="new",
            filled_qty=0,
            filled_avg_price=None,
            submitted_at=datetime.utcnow(),
            filled_at=None,
        )
        self.orders[order_id] = alpaca_order
        return alpaca_order
    
    async def get_positions(self):
        """Mock getting positions - returns list of dict-like objects."""
        # Convert Mock objects to dict-like for subscript access
        result = []
        for symbol, pos in self.positions.items():
            # Create a dict that can be accessed with subscript notation
            result.append({
                "symbol": pos.symbol,
                "qty": pos.qty,
                "avg_entry_price": pos.avg_entry_price,
                "current_price": pos.current_price,
                "market_value": pos.market_value,
                "unrealized_pl": pos.unrealized_pl,
                "unrealized_plpc": pos.unrealized_plpc,
            })
        return result
    
    async def get_open_orders(self, symbol=None):
        """Mock getting open orders."""
        orders = [o for o in self.orders.values() if o.status in ["new", "pending_new", "partially_filled"]]
        if symbol:
            orders = [o for o in orders if o.symbol == symbol]
        return orders
    
    async def cancel_order(self, order_id):
        """Mock cancelling an order."""
        if order_id in self.orders:
            self.orders[order_id].status = "cancelled"
            return True
        return False


class MockExecutionStrategy:
    """Mock execution strategy for testing."""
    
    def __init__(self, config=None):
        self.config = config or {}
        self.max_positions = self.config.get("max_positions", 1)
    
    @property
    def id(self):
        return "mock_strategy"
    
    @property
    def name(self):
        return "Mock Strategy"
    
    @property
    def description(self):
        return "Mock strategy for testing"
    
    @property
    def strategy_type(self):
        return "math-based"
    
    async def get_monitored_symbols(self, candidates, active_position_count=0, active_order_count=0):
        """Mock candidate selection - returns first symbol if no active positions or orders."""
        if candidates and (active_position_count + active_order_count) < self.max_positions:
            return [candidates[0].get("ticker", "MOCK")]
        return []
    
    async def should_enter(self, symbol, market_data):
        """Mock entry check - always returns True."""
        from app.strategies.base import EntrySignal
        return EntrySignal(should_enter=True, reason="mock_entry")
    
    async def should_exit(self, position, market_data):
        """Mock exit check - always returns False."""
        from app.strategies.base import ExitSignal
        return ExitSignal(should_exit=False)
    
    async def position_sizing(self, signal, fund_balance, risk_params):
        """Mock position sizing."""
        return risk_params.get("size_per_trade", 1000.0)


@pytest.fixture
def mock_market_data():
    """Fixture providing mock market data provider."""
    return MockMarketDataProvider()


@pytest.fixture
def mock_alpaca():
    """Fixture providing mock Alpaca service."""
    return MockAlpacaService(paper_trading=True)


@pytest.fixture
def mock_execution_strategy():
    """Fixture providing mock execution strategy."""
    return MockExecutionStrategy()
