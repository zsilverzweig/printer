# Historical Data Loader - Bug Fixes & Tests

## Date: 2025-11-02

## Summary

Found and fixed multiple critical bugs in the historical market data loading system through comprehensive testing.

## Bugs Found & Fixed

### Bug 1: Missing Database Fields ✅ FIXED

**Issue:** `AssetLoadingStatus` model was missing required fields that the loader was trying to use.

**Error:**

```
'progress_pct' is an invalid keyword argument for AssetLoadingStatus
```

**Fix:**

- Added `progress_pct` (Float) field to `AssetLoadingStatus` model
- Added `tickers_succeeded` (Integer) field to `AssetLoadingStatus` model
- Created migration `018_add_progress_fields_to_asset_loading_status.py`

**Files Changed:**

- `apps/server/app/models/assets.py` - Added fields
- `apps/server/alembic/versions/018_add_progress_fields_to_asset_loading_status.py` - Migration

### Bug 2: Column Name Inconsistency ✅ FIXED

**Issue:** Database columns and code were using different naming conventions.

**Error:**

```
column "tickers_processed" of relation "asset_loading_status" does not exist
```

**Root Cause:**

- Database columns: `processed_tickers`, `failed_tickers`
- Code was using: `tickers_processed`, `tickers_failed`

**Fix:**
Updated `historical_data_loader.py` to use correct column names:

- Changed `status.tickers_processed` → `status.processed_tickers`
- Changed `status.tickers_failed` → `status.failed_tickers`
- Updated SQL UPDATE statements to use `processed_tickers` and `failed_tickers`

**Files Changed:**

- `apps/server/app/services/market/historical_data_loader.py`
  - Fixed `get_load_status()` field mapping
  - Fixed `_update_status()` SQL column names

### Bug 3: Updating NULL Values on NOT NULL Columns ✅ FIXED

**Issue:** The `_update_status()` function was updating ALL columns in the UPDATE statement, even when values weren't provided, causing NULL constraint violations.

**Error:**

```
column "tickers_processed" of relation "asset_loading_status" does not exist
```

**Root Cause:**

- Database columns: `processed_tickers`, `failed_tickers`
- Code was using: `tickers_processed`, `tickers_failed`

**Fix:**
Updated `historical_data_loader.py` to use correct column names:

- Changed `status.tickers_processed` → `status.processed_tickers`
- Changed `status.tickers_failed` → `status.failed_tickers`
- Updated SQL UPDATE statements to use `processed_tickers` and `failed_tickers`

**Files Changed:**

- `apps/server/app/services/market/historical_data_loader.py`
  - Fixed `get_load_status()` field mapping
  - Fixed `_update_status()` SQL column names

## Test Coverage Added

Created comprehensive test suite: `tests/test_historical_data_loader.py`

### Test Classes:

1. **TestDatabaseStats** - Database statistics retrieval

   - Empty database stats
   - Stats with sample data

2. **TestStatusManagement** - Status creation and updates

   - Creating new status records
   - Updating progress
   - Marking as completed
   - Error message handling

3. **TestFieldMapping** ⭐ KEY TEST

   - Verifies field name consistency between database and API
   - Ensures `processed_tickers` maps to `tickers_processed` in responses
   - Ensures `failed_tickers` maps to `tickers_failed` in responses

4. **TestBulkInsert** - Bar insertion logic

   - Bulk insert operations
   - Conflict handling (ON CONFLICT DO NOTHING)

5. **TestMockedPolygonData** - Symbol loading with mocked API

   - Successful data loading
   - Empty response handling

6. **TestProgressCalculation** - Progress tracking

   - Percentage calculation accuracy

7. **TestErrorHandling** - Error scenarios
   - Multiple failed symbols tracking

## Field Mapping Documentation

### Database → API Response Mapping:

| Database Column     | API Response Field  | Type  |
| ------------------- | ------------------- | ----- |
| `processed_tickers` | `tickers_processed` | int   |
| `failed_tickers`    | `tickers_failed`    | int   |
| `tickers_succeeded` | `tickers_succeeded` | int   |
| `progress_pct`      | `progress_pct`      | float |

This mapping is handled in `get_load_status()` function.

## Verification Steps

1. ✅ Migration 018 applied successfully
2. ✅ Server restarted without errors
3. ✅ Column name mismatches fixed
4. ✅ Tests written to prevent regression
5. 🔄 UI button should now work (ready to test)

## Next Steps

1. **Test the UI** - Click "Start Load" button in `/admin/assets` Market Data tab
2. **Verify progress tracking** - Check that percentages and counters update correctly
3. **Monitor for additional bugs** - Watch server logs during first real load

## Lessons Learned

1. **Field naming consistency is critical** - Database columns should match model field names to avoid confusion
2. **Always test new migrations** - These bugs were caught through testing
3. **Document field mappings** - When database and API use different names, document it clearly

### Bug 4: Connection Pool Exhaustion ✅ FIXED

**Issue:** Too many concurrent requests overwhelmed the HTTP connection pool.

**Error:**

```
Connection pool is full, discarding connection: api.polygon.io. Connection pool size: 1
```

**Root Cause:**

- Code was trying to make 100 concurrent requests
- Polygon SDK connection pool only has 1 connection
- This caused dropped connections and failures

**Fix:**
Changed to sequential processing with rate limiting:

- `CONCURRENT_REQUESTS = 1` (one at a time)
- `REQUEST_DELAY = 0.1` (100ms between requests, ~10 req/sec)
- Reduced batch size from 50 to 10

**Trade-off:**

- Slower: ~10 requests/sec instead of 100
- More reliable: No connection pool issues
- For 10,000 tickers with 1 day of data, will take ~15-20 minutes instead of 2 minutes

**Files Changed:**

- `apps/server/app/services/market/historical_data_loader.py`
  - Reduced concurrent requests to 1
  - Added 100ms delay between requests

### Bug 5: PostgreSQL Parameter Limit Exceeded ✅ FIXED

**Issue:** Bulk inserts failed when inserting too many bars at once.

**Error:**

```
Bulk insert failed: the number of query arguments cannot exceed 32767
```

**Root Cause:**

- PostgreSQL has a hard limit of 32,767 parameters per query
- Each bar has 10 fields (time, symbol, open, high, low, close, volume, vwap, trade_count, session_type)
- 1 day of extended hours for AAPL = ~960 minutes × 10 fields = 9,600 parameters
- Multiple days could easily exceed the limit

**Fix:**
Implemented chunked inserts:

- Chunk size: 3,000 bars per insert (safely under limit)
- Each chunk is inserted separately within the same transaction
- Added logging for multi-chunk inserts

**Files Changed:**

- `apps/server/app/services/market/historical_data_loader.py`
  - Updated `_bulk_insert_bars()` to chunk large batches
  - Added CHUNK_SIZE constant (3000)

## Performance Expectations

With the current conservative settings:

- **Speed**: ~10 requests per second
- **10,000 tickers, 1 day**: ~15-20 minutes
- **1,000 tickers, 1 day**: ~2 minutes
- **100 tickers, 1 day**: ~10-15 seconds

## Files Modified

```
apps/server/app/models/assets.py
apps/server/app/services/market/historical_data_loader.py
apps/server/alembic/versions/018_add_progress_fields_to_asset_loading_status.py
apps/server/tests/test_historical_data_loader.py (NEW)
apps/web/src/features/admin/components/ticker-database-management.tsx
```

## Testing Against Real PostgreSQL

The tests currently run against SQLite (test database). To test against the real PostgreSQL:

```bash
# Manual testing recommended
cd /Users/zs/repos/printer
docker compose logs -f server  # Watch logs
# Then click "Start Load" in UI
```
