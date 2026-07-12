# مقهى ترف — إدارة الطاولات

إدارة طاولات السنوكر والكوتشينة والبلايستيشن.
Snooker, Cards, and PlayStation. Track active group sessions, manage product
orders in real time, and bill customers when sessions close.

## Architecture

- **Frontend**: Next.js 14 App Router with React 18 and Tailwind CSS
- **State**: Zustand for client-side session and UI state
- **Database**: SQLite via better-sqlite3 (`data/floor.db`)
- **Billing**: Time-based for snooker and PlayStation areas; product-only for
  Cards (no hourly rate)

### Areas

| Area         | Tables | Hourly Rate |
|------------- | ------ | ----------- |
| Snooker      | 15     | $10         |
| Cards        | 6      | —           |
| PlayStation  | 4      | $8          |

### Data Model

- **Categories** — groups products (Drinks, Snacks, Extras)
- **Products** — items available for sale, each belonging to a category
- **Sessions** — an active group session tied to a table in an area
- **Session Items** — products added to a session with quantity and
  price-at-order-time snapshots

## Getting Started

```bash
# Install dependencies
npm install

# Seed default categories and products into the database
npm run seed

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Script            | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `npm run dev`     | Start development server                             |
| `npm run build`   | Build for production                                 |
| `npm run start`   | Start production server                              |
| `npm run lint`    | Run ESLint                                           |
| `npm run seed`    | Seed categories and products into data/floor.db      |
| `npm test`        | Run tests                                            |
| `npm run backup`  | Create a timestamped backup of the live database     |
| `npm run restore` | Restore from a backup file (interactive safety flow) |
| `npm run export:csv` | Export closed sessions to CSV for bookkeeping     |
| `npm run verify-db` | Run SQLite integrity check on data/floor.db        |

## Backups & Data Safety

The entire business state lives in a single SQLite file (`data/floor.db`).
Losing or corrupting that file means losing every session, sale, and product
record permanently. The following tools provide a complete safety net.

### Backup (`npm run backup`)

Uses SQLite's own `.backup()` API (not a raw file copy) to produce a
consistent snapshot even while the app is running with WAL journaling.

- Copies `data/floor.db` → `data/backups/floor-<timestamp>.db`.
- Keeps the most recent N backups (default 30, set `BACKUP_RETENTION` env
  var to change).
- **Recommended**: run at end-of-day at minimum. On Windows, schedule with
  Task Scheduler; on Linux/macOS, use cron.

### Restore (`npm run restore`)

Restores the live database from a backup file. This is a destructive
operation with built-in safety guards:

1. **Dry run by default** — without `--yes`, prints what would happen and
   exits without making changes.
2. **Pre-restore backup** — before overwriting `data/floor.db`, the current
   live DB is backed up to `data/backups/floor-pre-restore-<timestamp>.db`
   so a bad restore is always recoverable.
3. **Validation** — the target file is opened and checked for the expected
   tables (`categories`, `products`, `sessions`, `session_items`) and a
   readable `sessions` table. If anything looks wrong, the restore is
   aborted with a clear error.

```bash
# Dry run — see what would happen
npm run restore data/backups/floor-2026-07-11T22-00-00.db

# Actually execute the restore
npm run restore data/backups/floor-2026-07-11T22-00-00.db -- --yes
```

### Export CSV (`npm run export:csv`)

Exports closed sessions to a flat CSV file for external bookkeeping in Excel
or Google Sheets. One row per session-item line.

```bash
# Export today's closed sessions
npm run export:csv

# Export a specific date range
npm run export:csv -- --from 2026-07-01 --to 2026-07-12
```

Output columns: `session_id`, `area`, `table_number`, `label`, `opened_at`,
`closed_at`, `product_name`, `qty`, `unit_price`, `line_total`,
`session_billed_total`.

Files land in `data/exports/`.

### Verify Database (`npm run verify-db`)

Runs SQLite's `PRAGMA integrity_check` and reports PASS or FAIL. Fast and
cheap — run this after an unclean shutdown or before trusting a backup.

```bash
npm run verify-db
```

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable   | Default       | Description          |
| ---------- | ------------- | -------------------- |
| `APP_NAME` | `nour`        | Application name     |
| `APP_ENV`  | `development` | Deployment environment |
| `APP_PORT` | `3000`        | Dev server port      |

## Testing

```bash
npm test
```

Tests use Node.js built-in test runner (`node:test`) with `tsx` for
TypeScript compilation. Test files live under `tests/`.

## Project Structure

```
├── app/            # Next.js App Router (pages, API routes, layouts)
├── components/     # React components
├── lib/            # Shared logic (db, billing, config, types)
├── scripts/        # Utility scripts (seed)
├── tests/          # Test files
└── data/           # SQLite database (auto-created)
```
