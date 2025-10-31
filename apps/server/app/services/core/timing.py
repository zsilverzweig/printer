"""
Timing & Scheduling Utilities

Utilities for interval tracking, time-based conditions, and scheduling.
Used by strategies to check evaluation intervals and trading windows.
"""

from datetime import datetime, time, timedelta
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo


class IntervalTracker:
    """Track last execution times and check intervals."""
    
    def __init__(self):
        """Initialize interval tracker."""
        self._last_times: Dict[str, datetime] = {}
    
    def should_execute(
        self,
        key: str,
        interval_minutes: float
    ) -> bool:
        """
        Check if enough time has passed since last execution.
        
        Args:
            key: Unique identifier for the action being tracked
            interval_minutes: Minimum minutes between executions
            
        Returns:
            True if interval has passed or this is first execution
        """
        now = datetime.now()
        last_time = self._last_times.get(key)
        
        if last_time is None:
            return True
        
        elapsed_minutes = (now - last_time).total_seconds() / 60.0
        return elapsed_minutes >= interval_minutes
    
    def mark_executed(self, key: str) -> None:
        """
        Mark that an action was executed now.
        
        Args:
            key: Unique identifier for the action
        """
        self._last_times[key] = datetime.now()
    
    def reset(self, key: str) -> None:
        """
        Reset tracking for a key.
        
        Args:
            key: Unique identifier to reset
        """
        self._last_times.pop(key, None)
    
    def reset_all(self) -> None:
        """Reset all tracked intervals."""
        self._last_times.clear()
    
    def get_last_time(self, key: str) -> Optional[datetime]:
        """
        Get last execution time for a key.
        
        Args:
            key: Unique identifier
            
        Returns:
            Last execution datetime or None if never executed
        """
        return self._last_times.get(key)
    
    def get_elapsed_minutes(self, key: str) -> Optional[float]:
        """
        Get minutes elapsed since last execution.
        
        Args:
            key: Unique identifier
            
        Returns:
            Minutes elapsed or None if never executed
        """
        last_time = self._last_times.get(key)
        if last_time is None:
            return None
        
        return (datetime.now() - last_time).total_seconds() / 60.0


def is_within_trading_window(
    timestamp: datetime,
    windows: List[Tuple[time, time]],
    timezone: str = "America/New_York"
) -> bool:
    """
    Check if timestamp falls within trading windows.
    
    Args:
        timestamp: Time to check
        windows: List of (start_time, end_time) tuples defining trading windows
        timezone: Timezone name (default: America/New_York)
        
    Returns:
        True if timestamp is within any trading window
        
    Example:
        windows = [
            (time(9, 35), time(11, 30)),   # Morning session
            (time(13, 30), time(15, 30)),  # Afternoon session
        ]
        is_within_trading_window(datetime.now(), windows)
    """
    if not windows:
        return True  # No restrictions
    
    # Convert timestamp to target timezone
    tz = ZoneInfo(timezone)
    if timestamp.tzinfo is None:
        # Assume UTC if no timezone
        timestamp = timestamp.replace(tzinfo=ZoneInfo("UTC"))
    
    ts_local = timestamp.astimezone(tz)
    current_time = ts_local.time()
    
    # Check if time falls in any window
    for start, end in windows:
        if start <= current_time <= end:
            return True
    
    return False


def seconds_until_bar_close(
    bar_start: datetime,
    bar_interval_minutes: int = 5,
    current_time: Optional[datetime] = None
) -> float:
    """
    Calculate seconds remaining until bar close.
    
    Args:
        bar_start: Start time of the current bar
        bar_interval_minutes: Bar interval in minutes (default: 5)
        current_time: Current time (defaults to now if not provided)
        
    Returns:
        Seconds until bar closes (negative if bar already closed)
    """
    if current_time is None:
        current_time = datetime.now()
    
    # Ensure both datetimes have timezone info for comparison
    if bar_start.tzinfo is None:
        bar_start = bar_start.replace(tzinfo=ZoneInfo("UTC"))
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=ZoneInfo("UTC"))
    
    bar_end = bar_start + timedelta(minutes=bar_interval_minutes)
    seconds_remaining = (bar_end - current_time).total_seconds()
    
    return seconds_remaining


def is_near_bar_close(
    bar_start: datetime,
    bar_interval_minutes: int = 5,
    window_seconds: float = 20.0,
    current_time: Optional[datetime] = None
) -> bool:
    """
    Check if current time is near the bar close.
    
    Useful for strategies that want to enter/exit near candle close.
    
    Args:
        bar_start: Start time of the current bar
        bar_interval_minutes: Bar interval in minutes (default: 5)
        window_seconds: How many seconds before close to consider "near" (default: 20)
        current_time: Current time (defaults to now if not provided)
        
    Returns:
        True if within window_seconds of bar close
    """
    seconds_left = seconds_until_bar_close(bar_start, bar_interval_minutes, current_time)
    return 0 <= seconds_left <= window_seconds


def get_bar_start_time(
    timestamp: datetime,
    bar_interval_minutes: int = 5
) -> datetime:
    """
    Get the start time of the bar that contains this timestamp.
    
    Rounds down to the nearest bar boundary.
    
    Args:
        timestamp: Any time within the bar
        bar_interval_minutes: Bar interval in minutes
        
    Returns:
        Start time of the bar
    """
    # Convert to timestamp in seconds
    ts_seconds = timestamp.timestamp()
    
    # Calculate bar interval in seconds
    interval_seconds = bar_interval_minutes * 60
    
    # Round down to nearest interval
    bar_start_seconds = (ts_seconds // interval_seconds) * interval_seconds
    
    # Convert back to datetime
    bar_start = datetime.fromtimestamp(bar_start_seconds, tz=timestamp.tzinfo)
    
    return bar_start


def minutes_since(start_time: datetime) -> float:
    """
    Calculate minutes elapsed since a start time.
    
    Args:
        start_time: Start time
        
    Returns:
        Minutes elapsed (can be negative if start_time is in future)
    """
    now = datetime.now()
    
    # Ensure timezone compatibility
    if start_time.tzinfo is None and now.tzinfo is not None:
        start_time = start_time.replace(tzinfo=ZoneInfo("UTC"))
    elif start_time.tzinfo is not None and now.tzinfo is None:
        now = now.replace(tzinfo=ZoneInfo("UTC"))
    
    elapsed = (now - start_time).total_seconds() / 60.0
    return elapsed


def parse_time_string(time_str: str) -> time:
    """
    Parse time string in format "HH:MM" or "HH:MM:SS".
    
    Args:
        time_str: Time string (e.g., "09:30", "15:45:00")
        
    Returns:
        time object
        
    Raises:
        ValueError: If format is invalid
    """
    parts = time_str.split(":")
    
    if len(parts) == 2:
        # HH:MM format
        hour, minute = map(int, parts)
        return time(hour, minute)
    elif len(parts) == 3:
        # HH:MM:SS format
        hour, minute, second = map(int, parts)
        return time(hour, minute, second)
    else:
        raise ValueError(f"Invalid time format: {time_str}. Expected HH:MM or HH:MM:SS")


def convert_to_timezone(
    dt: datetime,
    target_timezone: str = "America/New_York"
) -> datetime:
    """
    Convert datetime to target timezone.
    
    Args:
        dt: Datetime to convert
        target_timezone: Target timezone name (default: America/New_York)
        
    Returns:
        Datetime in target timezone
    """
    tz = ZoneInfo(target_timezone)
    
    # If naive, assume UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    
    return dt.astimezone(tz)


