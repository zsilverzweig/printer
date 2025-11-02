"""
Tests for ingestion metrics tracking.

Tests the IngestionMetrics class that tracks real-time ingestion performance.
"""
import pytest
from datetime import datetime, timezone

from app.services.market.realtime_ingestion import IngestionMetrics


def test_ingestion_metrics_initialization():
    """Test initializing IngestionMetrics."""
    metrics = IngestionMetrics()
    
    assert metrics.messages_received == 0
    assert metrics.bars_inserted == 0
    assert metrics.batches_processed == 0
    assert metrics.errors == 0
    assert metrics.last_message_time is None
    assert metrics.started_at is None


def test_ingestion_metrics_reset():
    """Test resetting metrics."""
    metrics = IngestionMetrics()
    
    # Set some values
    metrics.messages_received = 100
    metrics.bars_inserted = 95
    metrics.batches_processed = 10
    metrics.errors = 5
    
    # Reset
    metrics.reset()
    
    assert metrics.messages_received == 0
    assert metrics.bars_inserted == 0
    assert metrics.batches_processed == 0
    assert metrics.errors == 0
    assert metrics.started_at is not None  # Should be set to current time


def test_ingestion_metrics_to_dict():
    """Test converting metrics to dictionary."""
    metrics = IngestionMetrics()
    metrics.reset()
    
    # Add some data
    metrics.messages_received = 1000
    metrics.bars_inserted = 950
    metrics.batches_processed = 10
    metrics.last_batch_size = 100
    metrics.last_batch_latency_ms = 45.5
    metrics.errors = 2
    
    data = metrics.to_dict()
    
    assert data["messages_received"] == 1000
    assert data["bars_inserted"] == 950
    assert data["batches_processed"] == 10
    assert data["last_batch_size"] == 100
    assert data["last_batch_latency_ms"] == 45.5
    assert data["errors"] == 2
    assert "uptime_seconds" in data
    assert "avg_bars_per_batch" in data
    assert data["avg_bars_per_batch"] == 95.0  # 950 / 10


def test_ingestion_metrics_avg_bars_per_batch():
    """Test average bars per batch calculation."""
    metrics = IngestionMetrics()
    metrics.bars_inserted = 300
    metrics.batches_processed = 5
    
    data = metrics.to_dict()
    
    assert data["avg_bars_per_batch"] == 60.0  # 300 / 5


def test_ingestion_metrics_avg_bars_per_batch_zero():
    """Test average bars per batch when no batches processed."""
    metrics = IngestionMetrics()
    
    data = metrics.to_dict()
    
    assert data["avg_bars_per_batch"] == 0  # No division by zero

