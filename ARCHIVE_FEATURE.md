# Fund Archive Feature

## Overview

Added the ability to archive funds, which hides them from the main funds list while preserving all their data.

## Changes Made

### Backend

1. **Model Update** (`apps/server/app/models/strategies.py`):

   - Added `archived` boolean field to Fund model (defaults to False)

2. **API Endpoints** (`apps/server/app/routers/funds.py`):

   - Updated `GET /funds` to filter out archived funds by default
     - Added `include_archived` query parameter to show archived funds if needed
   - Added `POST /funds/{fund_id}/archive` - Archive a fund (must be stopped)
   - Added `POST /funds/{fund_id}/unarchive` - Unarchive a fund
   - Updated `serialize_fund` to include archived field

3. **Migration** (`apps/server/alembic/versions/2b060460bb9a_add_archived_field_to_funds.py`):
   - Created migration to add archived column
   - Migration is stamped but column needs to be added manually

### Frontend

1. **Types** (`packages/shared/src/types/funds.ts`):

   - Added `archived?: boolean` to Fund interface

2. **Service** (`apps/web/src/features/finance/funds/services/fund-service.ts`):

   - Added `archiveFund(fundId)` method
   - Added `unarchiveFund(fundId)` method

3. **UI** (`apps/web/src/features/finance/funds/components/fund-overview.tsx`):
   - Added "Archive Fund" button in Trading Controls section
   - Added confirmation dialog for archiving
   - Archives navigate back to funds list after success
   - Button is disabled while fund is actively trading

## Setup Required

Run this command to add the archived column to your database:

```bash
cd apps/server
source env.local  # or however you set your DATABASE_URL
python3 add_archived_column.py
```

This will add the `archived` column to the `funds` table.

## Usage

### Archiving a Fund

1. Stop the fund (must not be actively trading)
2. Go to the Overview tab
3. Click "Archive Fund" button
4. Confirm the action
5. Fund will be hidden from the main list and you'll be redirected

### Viewing Archived Funds

To see archived funds via API:

```bash
curl http://localhost:8000/api/funds?include_archived=true
```

### Unarchiving a Fund

Currently only available via API:

```bash
curl -X POST http://localhost:8000/api/funds/{fund_id}/unarchive
```

Future enhancement: Add an "Archived Funds" page in the UI to view and unarchive funds.

## Benefits

- **Clean Interface**: Hide old/inactive funds without deleting their data
- **Preserve History**: All orders, transactions, and performance data are kept
- **Reversible**: Can unarchive funds at any time
- **Safe**: Must stop trading before archiving

## Future Enhancements

- Add "Archived Funds" page in the UI
- Add bulk archive/unarchive operations
- Add auto-archive for funds inactive > X days
- Show archived badge on fund detail page if viewing archived fund

