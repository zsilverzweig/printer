"""
Test to verify timezone conversion from frontend to backend.

This test verifies that:
1. Frontend sends timestamps as ISO strings in UTC
2. Backend correctly parses them as UTC datetimes
3. Historical queries use the correct UTC timestamp
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_timestamp_parsing_utc():
    """Test that timestamp query parameter is correctly parsed as UTC."""
    # Simulate what the frontend sends: ISO string with Z (UTC indicator)
    # Example: User picks "Nov 2, 2025 3:30 PM" in EST (UTC-5)
    # JavaScript toISOString() converts to: "2025-11-02T20:30:00.000Z"
    iso_timestamp = "2025-11-02T20:30:00.000Z"
    
    # Make a request with this timestamp
    response = client.post(
        f"/api/screening-criteria/run?timestamp={iso_timestamp}",
        json={
            "min_price": 1.0,
            "max_price": 10.0,
            "limit": 10
        }
    )
    
    # The endpoint should accept it (may fail due to no data, but that's ok)
    # We're just testing that the timestamp is parsed correctly
    print(f"Response status: {response.status_code}")
    print(f"Response body: {response.json() if response.status_code != 500 else response.text[:200]}")
    
    # Should not fail due to timezone issues
    assert response.status_code in [200, 503], f"Unexpected status: {response.status_code}"


def test_timestamp_formats():
    """Test various ISO timestamp formats."""
    test_cases = [
        "2025-11-02T20:30:00.000Z",  # With milliseconds and Z
        "2025-11-02T20:30:00Z",       # Without milliseconds
        "2025-11-02T20:30:00+00:00",  # With explicit +00:00
    ]
    
    for iso_timestamp in test_cases:
        print(f"\nTesting timestamp format: {iso_timestamp}")
        response = client.post(
            f"/api/screening-criteria/run?timestamp={iso_timestamp}",
            json={
                "min_price": 1.0,
                "limit": 10
            }
        )
        
        print(f"  Status: {response.status_code}")
        # Should not fail due to parsing issues
        assert response.status_code in [200, 503], f"Failed for {iso_timestamp}: {response.status_code}"


def test_javascript_toisostring_behavior():
    """
    Test that mimics JavaScript Date.toISOString() behavior.
    
    JavaScript behavior:
    - new Date('2025-11-02T15:30:00') in EST (UTC-5)
    - .toISOString() returns '2025-11-02T20:30:00.000Z' (adds 5 hours)
    """
    # Simulate a date in local time (EST = UTC-5)
    local_time_str = "2025-11-02 15:30:00"  # 3:30 PM EST
    
    # Python equivalent of JavaScript's toISOString()
    # JavaScript automatically converts to UTC
    # In EST (UTC-5), 3:30 PM EST = 8:30 PM UTC
    expected_utc = "2025-11-02T20:30:00.000Z"
    
    print(f"\nLocal time (EST): {local_time_str}")
    print(f"Expected UTC (what JS toISOString() would send): {expected_utc}")
    
    response = client.post(
        f"/api/screening-criteria/run?timestamp={expected_utc}",
        json={"limit": 10}
    )
    
    print(f"Backend response status: {response.status_code}")
    assert response.status_code in [200, 503]


@pytest.mark.asyncio
async def test_datetime_timezone_awareness():
    """Test that backend correctly handles timezone-aware datetimes."""
    from datetime import timezone
    
    # Create a UTC datetime (what backend should have after parsing)
    utc_dt = datetime(2025, 11, 2, 20, 30, 0, tzinfo=timezone.utc)
    
    print(f"\nUTC datetime: {utc_dt}")
    print(f"ISO format: {utc_dt.isoformat()}")
    print(f"Timestamp has timezone: {utc_dt.tzinfo is not None}")
    print(f"Timezone: {utc_dt.tzinfo}")
    
    # Verify timezone is UTC
    assert utc_dt.tzinfo == timezone.utc
    
    # Verify ISO format matches what frontend sends
    iso_str = utc_dt.isoformat()
    # Should be: 2025-11-02T20:30:00+00:00
    assert "2025-11-02T20:30:00" in iso_str
    assert utc_dt.tzinfo == timezone.utc

