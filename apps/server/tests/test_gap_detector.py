"""
Tests for gap detection service.

Tests gap identification and prioritization logic.
"""
import pytest
from datetime import date, timedelta

from app.services.market.gap_detector import DataGap, GapDetectorService


def test_data_gap_creation():
    """Test creating a DataGap instance."""
    gap = DataGap(
        symbol="AAPL",
        date=date(2025, 11, 1),
        bar_count=200,
        priority=1
    )
    
    assert gap.symbol == "AAPL"
    assert gap.priority == 1
    assert gap.bar_count == 200


def test_data_gap_to_dict():
    """Test converting DataGap to dictionary."""
    gap = DataGap(
        symbol="TSLA",
        date=date(2025, 11, 1),
        gap_type="missing_date",
        priority=2
    )
    
    gap_dict = gap.to_dict()
    
    assert gap_dict["symbol"] == "TSLA"
    assert gap_dict["date"] == "2025-11-01"
    assert gap_dict["gap_type"] == "missing_date"
    assert gap_dict["priority"] == 2
    assert "detected_at" in gap_dict


def test_gap_detector_initialization():
    """Test initializing GapDetectorService."""
    detector = GapDetectorService(lookback_days=30)
    
    assert detector.lookback_days == 30
    assert detector.gap_queue == []


def test_gap_detector_get_queued_gaps_empty():
    """Test getting gaps from empty queue."""
    detector = GapDetectorService(lookback_days=30)
    
    gaps = detector.get_queued_gaps(limit=10)
    
    assert gaps == []


def test_gap_detector_get_queued_gaps_with_data():
    """Test getting gaps when queue has data."""
    detector = GapDetectorService(lookback_days=30)
    
    # Manually add gaps to queue
    detector.gap_queue = [
        DataGap("AAPL", date(2025, 11, 1), "incomplete_day", priority=1),
        DataGap("TSLA", date(2025, 11, 1), "incomplete_day", priority=1),
        DataGap("NVDA", date(2025, 11, 2), "missing_date", priority=2),
    ]
    
    gaps = detector.get_queued_gaps(limit=2)
    
    assert len(gaps) == 2
    assert gaps[0].symbol == "AAPL"


def test_gap_detector_get_summary_empty():
    """Test getting summary with no gaps."""
    detector = GapDetectorService(lookback_days=30)
    
    summary = detector.get_gap_summary()
    
    assert summary["total_gaps"] == 0
    assert summary["unique_symbols"] == 0


def test_gap_detector_get_summary_with_gaps():
    """Test getting summary statistics."""
    detector = GapDetectorService(lookback_days=30)
    
    detector.gap_queue = [
        DataGap("AAPL", date(2025, 11, 1), "incomplete_day", priority=1),
        DataGap("AAPL", date(2025, 11, 2), "incomplete_day", priority=1),
        DataGap("TSLA", date(2025, 11, 1), "missing_date", priority=2),
        DataGap("*", date(2025, 11, 3), "no_validation", priority=1),
    ]
    
    summary = detector.get_gap_summary()
    
    assert summary["total_gaps"] == 4
    assert summary["unique_symbols"] == 2  # AAPL, TSLA (not "*")
    assert summary["by_type"]["incomplete_day"] == 2
    assert summary["by_type"]["missing_date"] == 1
    assert summary["by_type"]["no_validation"] == 1
    assert summary["by_priority"][1] == 3
    assert summary["by_priority"][2] == 1


def test_gap_priority_levels():
    """Test that gaps are created with correct priorities."""
    high_priority = DataGap("AAPL", date(2025, 11, 1), "incomplete_day", bar_count=100, priority=1)
    medium_priority = DataGap("TSLA", date(2025, 11, 1), "missing_date", priority=2)
    low_priority = DataGap("NVDA", date(2025, 11, 1), "incomplete_day", bar_count=350, priority=3)
    
    assert high_priority.priority == 1
    assert medium_priority.priority == 2
    assert low_priority.priority == 3

