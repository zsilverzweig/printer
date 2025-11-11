"""
Comprehensive Market Data Service for historical bars.

Single source of truth for all historical bar queries across strategies, screener,
and other services. Database-first approach with intelligent API fallback and caching.
"""

import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence
from decimal import Decimal
from sqlalchemy import select, text, and_, bindparam, String
from sqlalchemy.dialects.postgresql import insert, ARRAY as postgresql_ARRAY

from app.services.core.database import get_async_session
from app.models.market_data import MarketData
from app.services.core.time_context import get_current_time, get_backtest_context
from app.services.market.metrics_calculator import METRIC_FIELDS


logger = logging.getLogger(__name__)


def _safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


_METRIC_COLUMNS_SQL = ",\n                        ".join(METRIC_FIELDS)


class MarketDataService:
    """
    Centralized service for querying historical market data bars.
    
    Features:
    - Database-first queries (TimescaleDB hypertable)
    - Intelligent API fallback (Alpaca -> Polygon) when validation is missing
    - Automatic caching of API results
    - Batch query support for multiple symbols
    - Data quality validation
    - Performance metrics tracking
    """
    
    def __init__(self):
        """Initialize the service."""
        self.staleness_minutes = 5  # Max age for "fresh" data
        
        # Performance tracking
        self._db_hits = 0
        self._api_calls = 0
        self._total_queries = 0
    
    async def get_bars(
        self,
        symbol: str,
        timeframe: str = "1min",
        lookback_minutes: int = 60,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get historical bars for a single symbol - DATABASE FIRST.
        
        Logic:
        1. Normalize timeframe format (1Min -> 1min)
        2. Calculate time window
        3. Query database
        4. If sufficient data, return from DB
        5. Otherwise, fetch from API and cache
        
        Args:
            symbol: Stock ticker symbol
            timeframe: Bar granularity ("1min", "5min", "15min", "1hour", "1day")
            lookback_minutes: How far back to fetch (ignored if start_time provided)
            start_time: Optional explicit start time
            end_time: Optional explicit end time (defaults to now)
        
        Returns:
            List of bar dicts with keys: timestamp, open, high, low, close, volume
        """
        self._total_queries += 1
        
        # Normalize timeframe
        timeframe = self._normalize_timeframe(timeframe)
        
        # Calculate time window (respecting backtest context)
        if end_time is None:
            # Use backtest time if in backtest mode, otherwise current time
            end_time = get_current_time()
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
        if start_time is None:
            start_time = end_time - timedelta(minutes=lookback_minutes)
        
        result: Dict[str, List[Dict[str, Any]]] = {}

        try:
            # Check validation table first. If we have validation coverage for the requested
            # window, we trust whatever is already in the database and skip external calls.
            is_validated = await self._check_validation(symbol, timeframe, start_time, end_time)

            result = await self._query_database(
                symbols=[symbol],
                timeframe=timeframe,
                start_time=start_time,
                end_time=end_time
            )

            bars = result.get(symbol, [])

            if is_validated:
                self._db_hits += 1
                logger.debug(
                    "VALIDATION HIT: %s %s (%d bars) - using cached data",
                    symbol,
                    timeframe,
                    len(bars),
                )
                return bars

            db_bars_count = len(bars)

        except Exception as e:
            logger.warning(f"Database query failed for {symbol}: {e}")
            bars = result.get(symbol, []) if result else []
            db_bars_count = len(bars)

        # No validation coverage - fetch from API and cache what we receive.
        try:
            fetch_result = await self._fetch_from_api_and_cache(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes,
                start_time=start_time,
                end_time=end_time
            )
            bars = fetch_result["bars"]
            api_source = fetch_result["source"]
            fetched_count = fetch_result["fetched_count"]
            cached_count = fetch_result["cached_count"]

            logger.info(
                "DB MISS: %s %s (no validation record, %d cached bars) → "
                "Fetched %d bars from %s → Cached %d bars",
                symbol,
                timeframe,
                db_bars_count,
                fetched_count,
                api_source,
                cached_count,
            )

            self._api_calls += 1
            return bars

        except Exception as e:
            logger.error(f"API fetch failed for {symbol} {timeframe}: {e}")
            # Return whatever we got from DB, even if unvalidated
            return result.get(symbol, []) if result else []
    
    async def get_bars_batch(
        self,
        symbols: List[str],
        timeframe: str = "1min",
        lookback_minutes: int = 60,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get historical bars for multiple symbols in efficient batched queries.
        
        Critical for performance when monitoring many symbols.
        Processes up to 2000 symbols per batch to avoid query timeouts.
        
        Args:
            symbols: List of stock ticker symbols
            timeframe: Bar granularity
            lookback_minutes: How far back to fetch
            start_time: Optional explicit start time
            end_time: Optional explicit end time
        
        Returns:
            Dict mapping symbol -> list of bars
        """
        if not symbols:
            return {}
        
        self._total_queries += len(symbols)
        
        # Normalize timeframe
        timeframe = self._normalize_timeframe(timeframe)
        
        # Calculate time window
        if end_time is None:
            end_time = datetime.now(timezone.utc)
        if start_time is None:
            start_time = end_time - timedelta(minutes=lookback_minutes)
        
        # Query database in batches of 2000 symbols
        batch_size = 2000
        all_results = {}
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            
            try:
                result = await self._query_database(
                    symbols=batch,
                    timeframe=timeframe,
                    start_time=start_time,
                    end_time=end_time
                )
                all_results.update(result)
                
            except Exception as e:
                logger.error(f"Batch query failed for {len(batch)} symbols: {e}")
        
        # Track hits
        self._db_hits += len([s for s in all_results if all_results[s]])
        
        logger.debug(
            f"Batch query: {len(all_results)}/{len(symbols)} symbols retrieved "
            f"({timeframe}, {lookback_minutes}min)"
        )
        
        return all_results
    
    async def get_latest_bar(
        self,
        symbol: str,
        timeframe: str = "1min",
        at_timestamp: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get the most recent bar for a symbol, optionally at a specific timestamp.
        
        Optimized single-row query using index.
        
        Args:
            symbol: Stock ticker symbol
            timeframe: Bar granularity
            at_timestamp: Optional timestamp to get bar at or before
        
        Returns:
            Most recent bar dict or None if not found
        """
        timeframe = self._normalize_timeframe(timeframe)
        
        try:
            async with get_async_session() as session:
                if at_timestamp:
                    # Get latest bar at or before timestamp
                    stmt = select(MarketData).where(
                        and_(
                            MarketData.symbol == symbol,
                            MarketData.timescale == timeframe,
                            MarketData.time <= at_timestamp
                        )
                    ).order_by(MarketData.time.desc()).limit(1)
                else:
                    # Get most recent bar
                    stmt = select(MarketData).where(
                        and_(
                            MarketData.symbol == symbol,
                            MarketData.timescale == timeframe
                        )
                    ).order_by(MarketData.time.desc()).limit(1)
                
                result = await session.execute(stmt)
                bar = result.scalar_one_or_none()
                
                if bar:
                    return self._bar_to_dict(bar)
                return None
                
        except Exception as e:
            logger.error(f"Error fetching latest bar for {symbol}: {e}")
            return None
    
    async def get_latest_prices_batch(
        self,
        symbols: List[str],
        timeframe: str = "5min",
        at_timestamp: Optional[datetime] = None
    ) -> Dict[str, float]:
        """
        Get latest close prices for multiple symbols - optimized for screener.
        
        Uses pre-computed lookup table in backtest mode for instant queries.
        
        Args:
            symbols: List of stock symbols
            timeframe: Bar granularity to use for prices (ignored in backtest - uses 1min lookup)
            at_timestamp: Optional timestamp (for historical screener runs)
        
        Returns:
            Dict mapping symbol -> close price
        """
        if not symbols:
            return {}
        
        # Check if in backtest mode and lookup table is available
        ctx = get_backtest_context()
        if ctx and at_timestamp:
            # Try backtest lookup table first - PARALLELIZED for max speed!
            try:
                LOOKUP_CHUNK_SIZE = 200  # Chunk size for lookup table queries
                
                if len(symbols) > LOOKUP_CHUNK_SIZE:
                    # Parallelize lookup table queries with connection limit
                    chunks = [symbols[i:i + LOOKUP_CHUNK_SIZE] for i in range(0, len(symbols), LOOKUP_CHUNK_SIZE)]
                    
                    import time
                    start = time.time()
                    
                    # Use semaphore to limit concurrent connections (max 5 to avoid "too many clients")
                    semaphore = asyncio.Semaphore(5)
                    
                    async def bounded_lookup(chunk):
                        async with semaphore:
                            return await self._get_prices_from_lookup_table(chunk, at_timestamp)
                    
                    tasks = [bounded_lookup(chunk) for chunk in chunks]
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    # Merge results
                    price_map = {}
                    for result in results:
                        if isinstance(result, dict):
                            price_map.update(result)
                    
                    elapsed = time.time() - start
                    
                    if price_map:
                        from app.services.core.time_context import get_backtest_id
                        bt_id = get_backtest_id()
                        bt_label = f"[BT:{bt_id[:8]}]" if bt_id else ""
                        logger.info(f"{bt_label} ⚡ INSTANT lookup: {len(price_map)} symbols in {elapsed*1000:.0f}ms (backtest table, {len(chunks)} parallel)")
                        return price_map
                else:
                    # Small batch - single lookup query
                    result = await self._get_prices_from_lookup_table(symbols, at_timestamp)
                    if result:
                        logger.info(f"⚡ INSTANT lookup: {len(result)} symbols (backtest table)")
                        return result
                        
            except Exception as e:
                logger.warning(f"Lookup table query failed, falling back: {e}")
        
        timeframe = self._normalize_timeframe(timeframe)
        
        # For large batches, split into parallel chunks for speed
        CHUNK_SIZE = 10  # Tiny chunks = maximum parallelism (10 symbols per query, ~130 concurrent)
        if len(symbols) > CHUNK_SIZE:
            # Run parallel queries
            chunks = [symbols[i:i + CHUNK_SIZE] for i in range(0, len(symbols), CHUNK_SIZE)]
            
            # Get backtest ID for logging
            from app.services.core.time_context import get_backtest_id
            bt_id = get_backtest_id()
            bt_label = f"[BT:{bt_id[:8]}]" if bt_id else ""
            
            logger.info(f"{bt_label} [BATCH] Splitting {len(symbols)} symbols into {len(chunks)} parallel queries")
            
            import time
            start = time.time()
            
            # Use semaphore to limit concurrent DB connections (max 5 to avoid "too many clients")
            semaphore = asyncio.Semaphore(5)
            
            async def bounded_query(chunk):
                async with semaphore:
                    return await self._get_latest_prices_chunk(chunk, timeframe, at_timestamp)
            
            tasks = [bounded_query(chunk) for chunk in chunks]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Merge results
            price_map = {}
            for result in results:
                if isinstance(result, dict):
                    price_map.update(result)
                elif isinstance(result, Exception):
                    logger.warning(f"Chunk query failed: {result}")
            
            elapsed = time.time() - start
            logger.info(f"{bt_label} [BATCH] Completed {len(chunks)} parallel queries in {elapsed:.2f}s ({len(price_map)} symbols)")
            
            return price_map
        
        # Small batch - single query
        return await self._get_latest_prices_chunk(symbols, timeframe, at_timestamp)
    
    async def _get_prices_from_lookup_table(
        self,
        symbols: List[str],
        at_timestamp: datetime
    ) -> Dict[str, float]:
        """
        Get prices from pre-computed backtest lookup table (instant!).
        
        This queries the materialized snapshot data instead of scanning history.
        
        Args:
            symbols: List of stock symbols
            at_timestamp: Timestamp to get prices for
            
        Returns:
            Dict mapping symbol -> close price
        """
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    SELECT symbol, close
                    FROM market_data_backtest_lookup
                    WHERE symbol = ANY(:symbols)
                      AND timescale = '1min'
                      AND lookup_time = :lookup_time
                """),
                {"symbols": symbols, "lookup_time": at_timestamp}
            )
            
            price_map = {}
            for row in result:
                if row[1] is not None:
                    price_map[row[0]] = float(row[1])
            
            return price_map
    
    async def _get_latest_prices_chunk(
        self,
        symbols: List[str],
        timeframe: str,
        at_timestamp: Optional[datetime] = None
    ) -> Dict[str, float]:
        """Execute a single price query for a chunk of symbols."""
        try:
            async with get_async_session() as session:
                if at_timestamp:
                    # Historical mode: Use LATERAL join for better performance
                    # This does one index lookup per symbol instead of scanning all bars
                    result = await session.execute(
                        text("""
                            SELECT s.symbol, m.close as current_price
                            FROM unnest(CAST(:symbols AS text[])) AS s(symbol)
                            CROSS JOIN LATERAL (
                                SELECT close
                                FROM market_data
                                WHERE symbol = s.symbol
                                  AND timescale = :timescale
                                  AND time <= :timestamp
                                ORDER BY time DESC
                                LIMIT 1
                            ) m
                        """).bindparams(
                            bindparam("symbols", type_=postgresql_ARRAY(String))
                        ),
                        {"symbols": symbols, "timescale": timeframe, "timestamp": at_timestamp}
                    )
                else:
                    # Live mode: Use LATERAL join
                    result = await session.execute(
                        text("""
                            SELECT s.symbol, m.close as current_price
                            FROM unnest(CAST(:symbols AS text[])) AS s(symbol)
                            CROSS JOIN LATERAL (
                                SELECT close
                                FROM market_data
                                WHERE symbol = s.symbol
                                  AND timescale = :timescale
                                ORDER BY time DESC
                                LIMIT 1
                            ) m
                        """).bindparams(
                            bindparam("symbols", type_=postgresql_ARRAY(String))
                        ),
                        {"symbols": symbols, "timescale": timeframe}
                    )
                
                price_map = {}
                for row in result:
                    if row[1] is not None:
                        price_map[row[0]] = float(row[1])
                
                return price_map
                
        except Exception as e:
            logger.error(f"Error fetching latest prices chunk ({len(symbols)} symbols): {e}")
            return {}
    
    async def _query_database(
        self,
        symbols: List[str],
        timeframe: str,
        start_time: datetime,
        end_time: datetime
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Query market_data table efficiently using proper indexes.
        
        Uses idx_market_data_symbol_timescale_time index for optimal performance.
        
        Args:
            symbols: List of symbols to query
            timeframe: Normalized timeframe string
            start_time: Start of time range
            end_time: End of time range
        
        Returns:
            Dict mapping symbol -> list of bars (chronological order)
        """
        if not symbols:
            return {}
        
        async with get_async_session() as session:
            # Use raw SQL for better control and performance
            result = await session.execute(
                text(f"""
                    SELECT 
                        time,
                        symbol,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        vwap,
                        trade_count,
                        {_METRIC_COLUMNS_SQL}
                    FROM market_data
                    WHERE symbol = ANY(:symbols)
                      AND timescale = :timescale
                      AND time >= :start_time
                      AND time <= :end_time
                    ORDER BY symbol, time ASC
                """),
                {
                    "symbols": symbols,
                    "timescale": timeframe,
                    "start_time": start_time,
                    "end_time": end_time
                }
            )
            
            # Group bars by symbol
            bars_by_symbol = {}
            for row in result:
                mapping = row._mapping
                symbol = mapping["symbol"]
                bar_data: Dict[str, Any] = {
                    "timestamp": mapping["time"],
                    "open": _safe_float(mapping["open"], 0.0),
                    "high": _safe_float(mapping["high"], 0.0),
                    "low": _safe_float(mapping["low"], 0.0),
                    "close": _safe_float(mapping["close"], 0.0),
                    "volume": _safe_int(mapping["volume"], 0),
                    "vwap": _safe_float(mapping["vwap"]),
                    "trade_count": _safe_int(mapping["trade_count"]),
                }

                for field in METRIC_FIELDS:
                    value = mapping[field] if field in mapping else None
                    bar_data[field] = _safe_float(value)

                bars_by_symbol.setdefault(symbol, []).append(bar_data)
            
            return bars_by_symbol

    async def get_coverage_summary(
        self,
        dates: Sequence[date],
        timescales: Optional[Sequence[str]] = None
    ) -> Dict[str, Dict[str, Dict[str, Any]]]:
        """
        Summarize stored market data coverage for the requested dates/timescales.

        Args:
            dates: Sequence of trading dates to inspect.
            timescales: Optional list of timescales. Defaults to all known timescales.

        Returns:
            Nested dict keyed by ISO date -> timescale -> coverage metrics.
        """
        if not dates:
            return {}

        # Normalize and deduplicate inputs
        unique_dates = sorted({d for d in dates})
        if not unique_dates:
            return {}

        if timescales is None:
            requested_timescales = ["1min", "5min", "15min", "1hour", "1day"]
        else:
            requested_timescales = []
            for ts in timescales:
                if ts:
                    normalized = self._normalize_timeframe(ts)
                    if normalized not in requested_timescales:
                        requested_timescales.append(normalized)

        if not requested_timescales:
            return {}

        start_date = unique_dates[0]
        end_date = unique_dates[-1]

        start_ts = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        end_ts_exclusive = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)

        summary: Dict[str, Dict[str, Dict[str, Any]]] = {}

        try:
            async with get_async_session() as session:
                result = await session.execute(
                    text(
                        """
                        SELECT
                            DATE(time) AS day,
                            timescale,
                            COUNT(*) AS bar_count,
                            COUNT(DISTINCT symbol) AS symbol_count,
                            MIN(time) AS first_bar,
                            MAX(time) AS last_bar
                        FROM market_data
                        WHERE timescale = ANY(:timescales)
                          AND time >= :start_ts
                          AND time < :end_ts
                        GROUP BY day, timescale
                        """
                    ),
                    {
                        "timescales": requested_timescales,
                        "start_ts": start_ts,
                        "end_ts": end_ts_exclusive,
                    },
                )

                for row in result:
                    mapping = row._mapping
                    day: date = mapping["day"]
                    if day not in unique_dates:
                        continue
                    timescale = mapping["timescale"]

                    summary.setdefault(day.isoformat(), {})[timescale] = {
                        "bar_count": int(mapping["bar_count"] or 0),
                        "symbol_count": int(mapping["symbol_count"] or 0),
                        "first_bar": mapping["first_bar"],
                        "last_bar": mapping["last_bar"],
                    }

        except Exception as exc:
            logger.error("Failed to compute coverage summary: %s", exc, exc_info=True)

        return summary
    
    async def _fetch_from_api_and_cache(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int,
        start_time: datetime,
        end_time: datetime
    ) -> Dict[str, Any]:
        """
        Fetch bars from external API and cache in database.
        
        Tries Alpaca first, falls back to Polygon.
        Caches all fetched bars in market_data table.
        
        Args:
            symbol: Stock symbol
            timeframe: Normalized timeframe
            lookback_minutes: Lookback period
            start_time: Start time
            end_time: End time
        
        Returns:
            Dict with keys: bars, source, fetched_count, cached_count
        """
        bars = []
        api_source = None
        
        # Try Alpaca first
        try:
            from alpaca.data.historical import StockHistoricalDataClient
            from alpaca.data.requests import StockBarsRequest
            from alpaca.data.timeframe import TimeFrame
            import os
            
            api_key = os.getenv("ALPACA_API_KEY")
            api_secret = os.getenv("ALPACA_API_SECRET")
            
            if api_key and api_secret:
                client = StockHistoricalDataClient(api_key, api_secret)
                
                # Convert timeframe to Alpaca format
                tf_map = {
                    "1min": TimeFrame.Minute,
                    "5min": TimeFrame(5, "Min"),
                    "15min": TimeFrame(15, "Min"),
                    "1hour": TimeFrame.Hour,
                    "1day": TimeFrame.Day,
                }
                
                tf = tf_map.get(timeframe, TimeFrame.Minute)
                
                request = StockBarsRequest(
                    symbol_or_symbols=symbol,
                    timeframe=tf,
                    start=start_time,
                    end=end_time
                )
                
                response = client.get_stock_bars(request)
                
                if symbol in response:
                    for bar in response[symbol]:
                        bars.append({
                            "timestamp": bar.timestamp,
                            "open": float(bar.open),
                            "high": float(bar.high),
                            "low": float(bar.low),
                            "close": float(bar.close),
                            "volume": int(bar.volume),
                        })
                    
                    api_source = "Alpaca"
                    
        except Exception as e:
            logger.warning(f"Alpaca fetch failed for {symbol}: {e}")
        
        # Fall back to Polygon if Alpaca didn't work
        if not bars:
            try:
                from polygon import RESTClient
                import app.core as core
                
                client = core.get_client()
                
                # Convert timeframe to Polygon format
                tf_map = {
                    "1min": (1, "minute"),
                    "5min": (5, "minute"),
                    "15min": (15, "minute"),
                    "1hour": (1, "hour"),
                    "1day": (1, "day"),
                }
                
                multiplier, timespan = tf_map.get(timeframe, (1, "minute"))
                
                from_date = start_time.strftime("%Y-%m-%d")
                to_date = end_time.strftime("%Y-%m-%d")
                
                aggs = list(client.list_aggs(
                    ticker=symbol,
                    multiplier=multiplier,
                    timespan=timespan,
                    from_=from_date,
                    to=to_date,
                    limit=5000
                ))
                
                for agg in aggs:
                    bars.append({
                        "timestamp": datetime.fromtimestamp(agg.timestamp / 1000, tz=timezone.utc),
                        "open": float(agg.open),
                        "high": float(agg.high),
                        "low": float(agg.low),
                        "close": float(agg.close),
                        "volume": int(agg.volume),
                    })
                
                api_source = "Polygon"
                
            except Exception as e:
                logger.error(f"Polygon fetch failed for {symbol}: {e}")
        
        fetched_count = len(bars)
        
        # Cache bars in database if we got any
        cached_count = 0
        if bars:
            cached_count = await self._cache_bars(symbol, timeframe, bars)
        
        return {
            "bars": bars,
            "source": api_source or "None",
            "fetched_count": fetched_count,
            "cached_count": cached_count
        }
    
    async def _cache_bars(
        self,
        symbol: str,
        timeframe: str,
        bars: List[Dict[str, Any]]
    ) -> int:
        """
        Cache fetched bars in market_data table.
        
        Deduplicates bars before insert to avoid constraint violations.
        Uses INSERT ... ON CONFLICT DO NOTHING to handle existing rows.
        
        Args:
            symbol: Stock symbol
            timeframe: Normalized timeframe
            bars: List of bars to cache
        
        Returns:
            Number of bars cached
        """
        if not bars:
            return 0
        
        try:
            async with get_async_session() as session:
                # Deduplicate bars by timestamp BEFORE inserting
                # API responses sometimes contain duplicate timestamps
                seen_timestamps = set()
                unique_records = []
                duplicates_found = 0
                
                for bar in bars:
                    timestamp = bar["timestamp"]
                    
                    # Check if we've already seen this timestamp
                    if timestamp in seen_timestamps:
                        duplicates_found += 1
                        continue
                    
                    seen_timestamps.add(timestamp)
                    unique_records.append({
                        "time": timestamp,
                        "symbol": symbol,
                        "timescale": timeframe,
                        "open": Decimal(str(bar["open"])),
                        "high": Decimal(str(bar["high"])),
                        "low": Decimal(str(bar["low"])),
                        "close": Decimal(str(bar["close"])),
                        "volume": bar["volume"],
                        "vwap": Decimal(str(bar.get("vwap"))) if bar.get("vwap") else None,
                        "trade_count": bar.get("trade_count"),
                        "session_type": "regular",
                    })
                
                if duplicates_found > 0:
                    logger.warning(
                        f"Deduplicated {duplicates_found} duplicate bars for {symbol} {timeframe} "
                        f"(API returned {len(bars)} bars, inserting {len(unique_records)} unique)"
                    )
                
                if not unique_records:
                    logger.warning(f"No unique bars to cache for {symbol} {timeframe}")
                    return 0
                
                # Bulk insert with conflict handling
                stmt = insert(MarketData).values(unique_records)
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["time", "symbol", "timescale"]
                )
                
                await session.execute(stmt)
                await session.commit()
                
                return len(unique_records)
                
        except Exception as e:
            logger.error(f"❌ Failed to cache bars for {symbol}: {e}", exc_info=True)
            return 0
    
    def _normalize_timeframe(self, timeframe: str) -> str:
        """
        Normalize timeframe format to database standard.
        
        Handles various input formats:
        - "1Min", "5Min", "15Min" (Alpaca/strategy format)
        - "1min", "5min", "15min" (database format)
        
        Args:
            timeframe: Input timeframe string
        
        Returns:
            Normalized timeframe string
        """
        # Normalize to lowercase
        tf = timeframe.lower()
        
        # Handle common variations
        tf = tf.replace("minute", "min")
        tf = tf.replace("hour", "hour")  # Already correct
        tf = tf.replace("day", "day")  # Already correct
        
        # Validate it's a known timeframe
        valid_timeframes = ["1min", "5min", "15min", "1hour", "1day"]
        if tf not in valid_timeframes:
            logger.warning(f"Unknown timeframe '{timeframe}', defaulting to '1min'")
            return "1min"
        
        return tf
    
    async def _check_validation(
        self,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime
    ) -> bool:
        """
        Check if this symbol/date/timescale has been validated.
        
        If validated, we've already fetched all available data from the API,
        so we should use whatever is in the DB (even if sparse/empty).
        
        Args:
            symbol: Stock symbol
            timeframe: Timescale
            start_time: Query start time
            end_time: Query end time
            
        Returns:
            True if data has been validated (don't refetch), False otherwise
        """
        try:
            from app.models.market_data import SymbolDateValidation
            
            async with get_async_session() as session:
                # Check if all days in the range have validation records
                start_date = start_time.date()
                end_date = end_time.date()
                
                stmt = select(SymbolDateValidation).where(
                    SymbolDateValidation.symbol == symbol,
                    SymbolDateValidation.timescale == timeframe,
                    SymbolDateValidation.date >= start_date,
                    SymbolDateValidation.date <= end_date
                )
                result = await session.execute(stmt)
                validations = result.scalars().all()

                if not validations:
                    return False

                validated_dates = {validation.date for validation in validations}

                current_date = start_date
                while current_date <= end_date:
                    if current_date not in validated_dates:
                        return False
                    current_date += timedelta(days=1)

                logger.debug(
                    "Validation coverage confirmed for %s %s from %s to %s",
                    symbol,
                    timeframe,
                    start_date,
                    end_date,
                )
                return True
        
        except Exception as e:
            logger.debug(f"Error checking validation for {symbol}: {e}")
            return False
    
    def _bar_to_dict(self, bar: MarketData) -> Dict[str, Any]:
        """Convert SQLAlchemy MarketData model to dict."""
        bar_dict: Dict[str, Any] = {
            "timestamp": bar.time,
            "open": _safe_float(bar.open, 0.0),
            "high": _safe_float(bar.high, 0.0),
            "low": _safe_float(bar.low, 0.0),
            "close": _safe_float(bar.close, 0.0),
            "volume": _safe_int(bar.volume, 0),
            "vwap": _safe_float(bar.vwap),
            "trade_count": _safe_int(bar.trade_count),
        }

        for field in METRIC_FIELDS:
            bar_dict[field] = _safe_float(getattr(bar, field, None))

        return bar_dict
    
    async def get_technical_indicators(
        self,
        symbol: str,
        timescale: str = "1min",
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        lookback_minutes: int = 60
    ) -> List[Dict[str, Any]]:
        """
        Get pre-calculated technical indicators for a symbol.
        
        Falls back to on-the-fly calculation if pre-computed data is missing.
        
        Args:
            symbol: Stock ticker symbol
            timescale: Bar granularity ("1min", "5min", "15min")
            start_time: Optional explicit start time
            end_time: Optional explicit end time (defaults to now)
            lookback_minutes: How far back to fetch (ignored if start_time provided)
        
        Returns:
            List of indicator dicts with keys: time, ema_12, ema_26, vwap, macd_line,
            macd_signal, macd_histogram, rsi_14, atr_14
        """
        # Calculate time window
        if end_time is None:
            end_time = get_current_time()
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
        if start_time is None:
            start_time = end_time - timedelta(minutes=lookback_minutes)
        
        try:
            bars_by_symbol = await self._query_database(
                symbols=[symbol],
                timeframe=timescale,
                start_time=start_time,
                end_time=end_time
            )

            bars = bars_by_symbol.get(symbol, [])
            if not bars:
                return []

            indicator_keys = [
                "ema_12",
                "ema_26",
                "macd_line",
                "macd_signal",
                "macd_histogram",
                "rsi_14",
                "atr_14",
            ]

            has_precomputed = any(
                any(bar.get(key) is not None for key in indicator_keys)
                for bar in bars
            )

            if has_precomputed:
                indicators = []
                for bar in bars:
                    indicators.append({
                        "time": bar["timestamp"],
                        "ema_12": bar.get("ema_12"),
                        "ema_26": bar.get("ema_26"),
                        "vwap": bar.get("vwap"),
                        "macd_line": bar.get("macd_line"),
                        "macd_signal": bar.get("macd_signal"),
                        "macd_histogram": bar.get("macd_histogram"),
                        "rsi_14": bar.get("rsi_14"),
                        "atr_14": bar.get("atr_14"),
                    })

                return indicators

            logger.debug(f"No stored indicators found for {symbol}, calculating on-the-fly")
            bars_raw = await self.get_bars(symbol, timeframe=timescale, start_time=start_time, end_time=end_time)

            if not bars_raw:
                return []

            from app.lib.technical_analysis import (
                calculate_ema,
                calculate_vwap,
                calculate_macd,
                calculate_rsi,
                average_true_range
            )

            ema_12_values = calculate_ema(bars_raw, period=12, price_key="close")
            ema_26_values = calculate_ema(bars_raw, period=26, price_key="close")
            vwap_values = calculate_vwap(bars_raw, reset_daily=True)
            macd_results = calculate_macd(bars_raw, fast_period=12, slow_period=26, signal_period=9)
            rsi_values = calculate_rsi(bars_raw, period=14, price_key="close")

            atr_values = []
            for i in range(len(bars_raw)):
                if i >= 14:
                    atr = average_true_range(bars_raw[:i + 1], period=14)
                    atr_values.append(atr)
                else:
                    atr_values.append(None)

            indicators = []
            for i, bar in enumerate(bars_raw):
                indicators.append({
                    "time": bar["timestamp"],
                    "ema_12": ema_12_values[i] if i < len(ema_12_values) else None,
                    "ema_26": ema_26_values[i] if i < len(ema_26_values) else None,
                    "vwap": vwap_values[i] if i < len(vwap_values) else None,
                    "macd_line": macd_results["macd"][i] if i < len(macd_results["macd"]) else None,
                    "macd_signal": macd_results["signal"][i] if i < len(macd_results["signal"]) else None,
                    "macd_histogram": macd_results["histogram"][i] if i < len(macd_results["histogram"]) else None,
                    "rsi_14": rsi_values[i] if i < len(rsi_values) else None,
                    "atr_14": atr_values[i] if i < len(atr_values) else None,
                })

            return indicators

        except Exception as e:
            logger.error(f"Error getting technical indicators for {symbol}: {e}", exc_info=True)
            return []
    
    async def get_indicators_batch(
        self,
        symbols: List[str],
        timescale: str = "1min",
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        lookback_minutes: int = 60
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get pre-calculated technical indicators for multiple symbols.
        
        Args:
            symbols: List of stock ticker symbols
            timescale: Bar granularity ("1min", "5min", "15min")
            start_time: Optional explicit start time
            end_time: Optional explicit end time (defaults to now)
            lookback_minutes: How far back to fetch (ignored if start_time provided)
        
        Returns:
            Dict mapping symbol to list of indicator dicts
        """
        results = {}
        
        # Process in parallel for better performance
        tasks = [
            self.get_technical_indicators(
                symbol, timescale=timescale, start_time=start_time,
                end_time=end_time, lookback_minutes=lookback_minutes
            )
            for symbol in symbols
        ]
        
        indicator_lists = await asyncio.gather(*tasks, return_exceptions=True)
        
        for symbol, indicators in zip(symbols, indicator_lists):
            if isinstance(indicators, Exception):
                logger.error(f"Error getting indicators for {symbol}: {indicators}")
                results[symbol] = []
            else:
                results[symbol] = indicators
        
        return results
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get service performance metrics.
        
        Returns:
            Dict with cache hit rate, API calls, etc.
        """
        hit_rate = self._db_hits / self._total_queries if self._total_queries > 0 else 0.0
        
        return {
            "total_queries": self._total_queries,
            "db_hits": self._db_hits,
            "api_calls": self._api_calls,
            "cache_hit_rate": hit_rate,
        }


# Global instance (singleton pattern like PriceService)
_market_data_service: Optional[MarketDataService] = None


def get_market_data_service() -> MarketDataService:
    """Get or create the global MarketDataService instance."""
    global _market_data_service
    
    if _market_data_service is None:
        _market_data_service = MarketDataService()
    
    return _market_data_service

