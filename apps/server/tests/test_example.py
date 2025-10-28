"""
Example test file showing pytest patterns for this project.
"""
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app


class TestBasicFunctionality:
    """Test basic application functionality."""

    def test_health_endpoint(self):
        """Test the health check endpoint."""
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    @pytest.mark.asyncio
    async def test_async_functionality(self):
        """Example of testing async code."""
        # This would test your async services
        # For now, just test that async functions work
        async def async_function():
            return "async result"
        
        result = await async_function()
        assert result == "async result"

    @pytest.mark.parametrize("endpoint", ["/health"])
    def test_endpoints_exist(self, endpoint):
        """Test that endpoints exist and return valid responses."""
        client = TestClient(app)
        response = client.get(endpoint)
        assert response.status_code == 200

    @pytest.mark.slow
    def test_slow_operation(self):
        """Example of a slow test that can be skipped in fast runs."""
        # This test would be skipped with: pytest -m "not slow"
        import time
        time.sleep(0.1)  # Simulate slow operation
        assert True


@pytest.fixture
def sample_data():
    """Example fixture for test data."""
    return {"symbol": "AAPL", "price": 150.0}


def test_with_fixture(sample_data):
    """Test using a fixture."""
    assert sample_data["symbol"] == "AAPL"
    assert sample_data["price"] == 150.0
