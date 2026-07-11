# nour — Coffee Shop Floor Management

A Next.js application for managing a coffee shop floor with three distinct areas:
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

| Script          | Purpose                           |
| --------------- | --------------------------------- |
| `npm run dev`   | Start development server          |
| `npm run build` | Build for production              |
| `npm run start` | Start production server           |
| `npm run lint`  | Run ESLint                        |
| `npm run seed`  | Seed categories and products into data/floor.db |
| `npm test`      | Run tests                         |

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
