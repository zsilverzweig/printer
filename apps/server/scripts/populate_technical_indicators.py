#!/usr/bin/env python3
"""
Populate technical indicators table for given date(s).

This pre-computes technical indicators (EMA, MACD, RSI, VWAP, ATR) for
intraday timescales, accelerating backtesting performance.
"""

import asyncio
import sys
import argparse
from datetime import datetime, timedelta, timezone, date as date_type
from typing import List

sys.path.insert(0, '/app')

from app.services.backtest.technical_indicators_service import (
    populate_indicators_for_date,
    check_indicators_coverage
)


async def populate_date(
    target_date: date_type,
    timescale: str = '1min'
):
    """Populate technical indicators for one date."""
    print(f"📊 Populating technical indicators for {target_date} ({timescale})")
    
    try:
        result = await populate_indicators_for_date(target_date, timescale=timescale)
        print(f"✅ Successfully populated {result['total_rows']:,} rows for {result['symbols']} symbols")
        print(f"   Table size: {result['size']}")
        return result
    except Exception as e:
        print(f"❌ Error populating {target_date}: {e}")
        raise


async def populate_date_range(
    start_date: date_type,
    end_date: date_type,
    timescale: str = '1min'
):
    """Populate technical indicators for a date range."""
    current_date = start_date
    total_rows = 0
    total_symbols = set()
    
    print(f"📊 Populating technical indicators from {start_date} to {end_date} ({timescale})")
    
    while current_date <= end_date:
        # Skip weekends
        if current_date.weekday() < 5:  # 0-4 = Monday-Friday
            try:
                result = await populate_indicators_for_date(current_date, timescale=timescale)
                total_rows += result['total_rows']
                print(f"✅ {current_date}: {result['total_rows']:,} rows, {result['symbols']} symbols")
            except Exception as e:
                print(f"❌ Error populating {current_date}: {e}")
        
        current_date += timedelta(days=1)
    
    print(f"\n✅ Completed: {total_rows:,} total rows populated")
    return {"total_rows": total_rows}


async def check_coverage(
    target_date: date_type,
    timescale: str = '1min'
):
    """Check coverage for a date."""
    coverage = await check_indicators_coverage(target_date, timescale=timescale)
    
    print(f"\n📊 Coverage for {target_date} ({timescale}):")
    print(f"   Has data: {coverage['has_data']}")
    print(f"   Total rows: {coverage['total_rows']:,}")
    print(f"   Symbols: {coverage['symbols']}")
    print(f"   Minutes: {coverage['minutes']}/{coverage['expected_minutes']}")
    print(f"   Completeness: {coverage['minutes'] / coverage['expected_minutes'] * 100:.1f}%")
    
    return coverage


async def main():
    parser = argparse.ArgumentParser(description='Populate technical indicators table')
    parser.add_argument('--date', type=str, help='Single date to populate (YYYY-MM-DD)')
    parser.add_argument('--start-date', type=str, help='Start date for range (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='End date for range (YYYY-MM-DD)')
    parser.add_argument('--timescale', type=str, default='1min', choices=['1min', '5min', '15min'],
                        help='Timescale to populate (default: 1min)')
    parser.add_argument('--check', action='store_true', help='Check coverage instead of populating')
    
    args = parser.parse_args()
    
    if args.check:
        if not args.date:
            print("❌ --date required for checking coverage")
            return
        
        target_date = datetime.fromisoformat(args.date).date()
        await check_coverage(target_date, timescale=args.timescale)
    
    elif args.date:
        # Single date
        target_date = datetime.fromisoformat(args.date).date()
        await populate_date(target_date, timescale=args.timescale)
    
    elif args.start_date and args.end_date:
        # Date range
        start_date = datetime.fromisoformat(args.start_date).date()
        end_date = datetime.fromisoformat(args.end_date).date()
        await populate_date_range(start_date, end_date, timescale=args.timescale)
    
    else:
        # Default: populate yesterday
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()
        # Skip if weekend
        if yesterday.weekday() >= 5:
            print(f"⚠️  {yesterday} is a weekend, skipping")
            return
        
        await populate_date(yesterday, timescale=args.timescale)


if __name__ == "__main__":
    asyncio.run(main())
