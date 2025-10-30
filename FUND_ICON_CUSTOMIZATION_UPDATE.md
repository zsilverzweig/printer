# Fund Icon Customization Update

## Summary

Updated the fund management system to support custom icons and colors for each fund, and modified the sidebar navigation to make the "Funds" section title clickable.

## Changes Made

### 1. Sidebar Navigation Update

**Modified Files:**

- `apps/web/src/lib/components/ui/app-sidebar.tsx`
- `apps/web/src/lib/components/ui/main-app-sidebar.tsx`

**Changes:**

- Added optional `titleHref` property to `SidebarSection` interface
- Made section titles clickable when `titleHref` is provided
- "Funds" section now links to `/funds` index page
- Removed "All Funds" menu item (redundant with clickable section title)
- Individual funds now display custom icons with their selected colors

### 2. Fund Type Updates

**Modified Files:**

- `packages/shared/src/types/funds.ts`

**Changes:**

- Added `icon?: string` field to `Fund` interface (stores Lucide icon name)
- Added `iconColor?: string` field to `Fund` interface (stores Tailwind color name)
- Updated `CreateFundInput` to accept icon and iconColor
- Updated `UpdateFundInput` to accept icon and iconColor

### 3. Backend Database Schema

**Modified Files:**

- `apps/server/app/models/strategies.py`
- `apps/server/alembic/versions/010_add_icon_fields_to_funds.py` (NEW)

**Changes:**

- Added `icon` column (String(50), nullable) to `Fund` model
- Added `icon_color` column (String(50), nullable) to `Fund` model
- Created database migration to add these columns

### 4. Backend API Updates

**Modified Files:**

- `apps/server/app/routers/funds.py`

**Changes:**

- Updated `CreateFundInput` Pydantic model to include icon and icon_color
- Updated `UpdateFundInput` Pydantic model to include icon and icon_color
- Updated `FundResponse` Pydantic model to include icon and icon_color
- Modified `create_fund` endpoint to handle icon fields
- Modified `update_fund` endpoint to handle icon fields
- Modified `serialize_fund` helper to include icon fields

### 5. Icon Configuration

**New Files:**

- `apps/web/src/features/finance/funds/config/icon-options.tsx`

**Features:**

- Provides 14 preset icon options from Lucide React
- Provides 12 dark-theme-friendly color options
- Helper functions `getIconByName()` and `getColorClasses()` for retrieving icon components and color classes
- All colors use semi-transparent backgrounds and vibrant text colors optimized for dark themes

**Available Icons:**

- Wallet, TrendingUp, TrendingDown, BarChart3, PieChart, Target, Zap, Flame, Rocket, LineChart, Activity, DollarSign, Coins, Briefcase

**Available Colors:**

- Blue, Green, Purple, Pink, Orange, Yellow, Cyan, Red, Emerald, Indigo, Rose, Amber

### 6. Fund Configuration UI

**New Files:**

- `apps/web/src/features/finance/funds/components/fund-basic-info-editor.tsx`

**Features:**

- Edit fund name, description, icon, and color
- Visual icon selector with 7-column grid
- Visual color selector with 6-column grid
- Live preview of icon/color combination
- Form validation and error handling
- Success feedback with auto-dismiss
- Only enables "Save" button when changes are detected

**Modified Files:**

- `apps/web/src/features/finance/funds/components/fund-detail-view.tsx`

**Changes:**

- Added `FundBasicInfoEditor` component to Configuration tab
- Positioned at the top of the configuration section

### 7. Create Fund Dialog Update

**Modified Files:**

- `apps/web/src/features/finance/funds/components/create-fund-dialog.tsx`

**Changes:**

- Added tabbed interface with "Basic Info" and "Appearance" tabs
- Basic Info tab contains: name, description, mode, initial balance
- Appearance tab contains: icon selector, color selector, preview
- Increased dialog width to 600px to accommodate icon grid
- Made dialog scrollable for smaller screens
- Default icon: Wallet, Default color: Blue

## Installation Instructions

### 1. Run Database Migration

Before starting the server, run the database migration to add the new columns:

```bash
cd apps/server
python run_migrations.py
```

Or using Alembic directly:

```bash
cd apps/server
alembic upgrade head
```

### 2. Install Dependencies

The changes use existing dependencies (Lucide React, Tailwind CSS), so no new packages need to be installed.

### 3. Start the Application

```bash
# Start backend
cd apps/server
./start_server.sh

# Start frontend (in another terminal)
cd apps/web
npm run dev
```

## Usage

### Creating a New Fund

1. Navigate to Funds page
2. Click "Create Fund" button
3. Fill in basic information in the "Basic Info" tab
4. Switch to "Appearance" tab to select icon and color
5. Preview your selections at the bottom
6. Click "Create Fund"

### Customizing an Existing Fund

1. Navigate to any fund detail page
2. Go to the "Configuration" tab
3. The "Fund Information" card appears at the top
4. Select a new icon from the grid
5. Select a new color from the grid
6. Preview your changes
7. Click "Save Changes"

### Sidebar Navigation

- Click on "Funds" section title to go to funds index page
- Individual fund items display their custom icons with colors
- Icons are color-coded according to each fund's selected color

## Technical Notes

### Icon System

- Icons are stored as Lucide icon names (strings) in the database
- Frontend uses `getIconByName()` to dynamically load the correct icon component
- Defaults to "Wallet" icon if no icon is specified or icon name is invalid

### Color System

- Colors are stored as Tailwind color names (e.g., "blue", "purple") in the database
- Frontend uses `getColorClasses()` to get the appropriate Tailwind classes
- Each color has three class variants: bgClass, textClass, borderClass
- Colors use semi-transparent backgrounds (e.g., `bg-blue-500/20`) for dark theme compatibility
- Defaults to blue if no color is specified or color name is invalid

### Backwards Compatibility

- Icon and icon_color fields are nullable in the database
- Backend uses `getattr()` with defaults for backwards compatibility
- Existing funds without icons will display with default Wallet/Blue combination
- No data migration required for existing funds

## Future Enhancements

Potential improvements for future iterations:

1. **Custom Icons**: Allow users to upload custom SVG icons
2. **More Colors**: Add more color options or allow custom hex colors
3. **Icon Categories**: Group icons by category (charts, money, trends, etc.)
4. **Fund Themes**: Save icon/color combinations as reusable themes
5. **Bulk Update**: Update icons/colors for multiple funds at once
6. **Icon Search**: Add search functionality to icon picker for easier selection

## Testing Checklist

- [x] Create new fund with custom icon and color
- [x] Edit existing fund's icon and color
- [x] Verify icons display correctly in sidebar
- [x] Verify "Funds" section title links to /funds
- [x] Verify color classes work in dark theme
- [x] Verify preview updates in real-time
- [x] Verify form validation works
- [x] Verify reset button works
- [x] Verify backwards compatibility with existing funds
- [ ] Run database migration on production
- [ ] Test on mobile devices
- [ ] Test with multiple funds

## Database Migration Details

**Migration File**: `apps/server/alembic/versions/010_add_icon_fields_to_funds.py`

**SQL Operations** (PostgreSQL):

```sql
-- Upgrade
ALTER TABLE funds ADD COLUMN icon VARCHAR(50);
ALTER TABLE funds ADD COLUMN icon_color VARCHAR(50);

-- Downgrade
ALTER TABLE funds DROP COLUMN icon_color;
ALTER TABLE funds DROP COLUMN icon;
```

**Migration is reversible** - you can downgrade if needed using:

```bash
alembic downgrade -1
```
