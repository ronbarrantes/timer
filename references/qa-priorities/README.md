# qa-priorities

Chrome extension MVP for QA to-do priorities.

## Features

- Import a priorities Excel file (`.xlsx`).
- Display rows as a to-do table with:
  - Completed checkbox
  - Cut time (friendly format like `3pm` / `3:01pm`)
  - UPC (from `Gtin`)
  - Quantity
  - Current location
  - Delete (`×`) action
- Filters source rows to tracked container tags:
  - `QA_HOLD_PICKING`
  - `QA_HOLD_PUTAWAY`
  - `QA_HOLD_REPLENISHMENT`
  - `QA_HOLD_REWAREHOUSING`
- Uses text-friendly repo assets for now (no PNG icons committed) to keep PR diffs reviewable in chat/PR tooling.
- Default sort order:
  1. `Earliest Cut-time`
  2. `Current Location` using the same mixed alpha-numeric sorting approach used in `qa-locations`.

## Build zip

```bash
./build-zip.sh
```

Creates `dist/qa-priorities-mvp.zip`.
