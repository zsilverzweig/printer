"""
Pytest configuration and shared fixtures.
"""
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app


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
