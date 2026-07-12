# مقهى ترف — خطة النظام الكاملة

> Planning doc only — written in this session per user instruction. Actual
> coding happens in a **new session**, split across Claude Code, Minimax
> (single window — does all UI sequentially), and Qwen, each restricted to
> the files listed below.
>
> Note: only one Minimax window is available, so the "Minimax A / Minimax B"
> split from the earlier draft is merged into one Minimax prompt that builds
> all the UI components in sequence within its own session. File ownership
> is unchanged — Minimax just does both halves itself instead of two
> parallel instances doing one half each.

## What exists already (committed)

`master` has an initial Next.js (TS/Tailwind) scaffold: `lib/types.ts`,
`lib/config.ts`, `lib/store.ts` (in-memory Zustand), `app/page.tsx` + 3
placeholder area components. This plan **extends** that scaffold — it does
not restart it.

## Confirmed requirements (from user)

- **Billing**: Snooker + PlayStation = automatic hourly rate × elapsed time.
  Cards = products only, no time charge.
- **Products**: organized by categories, editable list (add/remove items),
  quantity per item, added live during an open session.
- **Table identity**: every table has a number by default; staff can
  optionally rename it to a customer's name for that session.
- **History**: closed sessions are kept (not deleted) so the owner can look
  back — "history of customers" — even though there's no formal login per
  customer.
- **Device**: primarily a tablet in the shop. UI must be touch-first. An
  Android APK wrapper (Capacitor) is a planned next step after this web
  version — don't paint into a corner, but don't build the APK now.
- **Persistence**: single local device, local database (SQLite) — no cloud
  account, no monthly cost, no internet dependency.
- **Auth**: one shared login for all staff — no per-role accounts in v1.
- **Receipt**: on-screen total breakdown only. No printing in v1.

## Data model (extends `lib/types.ts`)

```ts
export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
}

export interface SessionItem {
  productId: string;
  name: string;   // snapshot at time of add, survives later price edits
  price: number;  // snapshot
  qty: number;
}

export interface GroupSession {
  id: string;
  area: AreaType;
  tableNumber: number;
  label?: string;       // optional customer name override
  openedAt: string;
  closedAt?: string;
  status: "open" | "closed";
  items: SessionItem[];
  billedTotal?: number; // set on close
}

export interface AreaConfig {
  area: AreaType;
  label: string;
  tableCount: number;
  hourlyRate: number | null; // null = no time-based billing (Cards)
}
```

## Billing logic (`lib/billing.ts`, new file, Claude owns)

```ts
export interface BillBreakdown {
  productsTotal: number;
  timeCost: number;
  elapsedMinutes: number;
  total: number;
}

export function computeBill(
  session: GroupSession,
  area: AreaConfig,
  closedAt: Date = new Date()
): BillBreakdown {
  const productsTotal = session.items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const elapsedMs = closedAt.getTime() - new Date(session.openedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
  const timeCost = area.hourlyRate ? (elapsedMinutes / 60) * area.hourlyRate : 0;
  return { productsTotal, timeCost, elapsedMinutes, total: productsTotal + timeCost };
}
```

## Persistence (SQLite, `lib/db.ts`, new file, Claude owns)

Use `better-sqlite3` (sync, zero-config, file-based — fits a single tablet/PC,
no server setup). DB file: `data/floor.db` (gitignored).

Tables: `categories(id, name, order)`, `products(id, category_id, name, price)`,
`sessions(id, area, table_number, label, opened_at, closed_at, status)`,
`session_items(id, session_id, product_id, name, price, qty)`.

## API routes (`app/api/**`, Claude owns)

| Route | Method | Purpose |
|---|---|---|
| `/api/sessions` | GET, POST | list open sessions / open a new one |
| `/api/sessions/[id]` | GET | session detail + live items |
| `/api/sessions/[id]/items` | POST | add item |
| `/api/sessions/[id]/items/[itemId]` | DELETE, PATCH | remove item / change qty |
| `/api/sessions/[id]/close` | POST | compute bill via `computeBill`, persist, mark closed |
| `/api/history` | GET | closed sessions, filter by area/date/label |
| `/api/products` | GET, POST, PUT, DELETE | catalog + category management |

## Screens / routes

1. `/` — Floor screen (exists). Extend: tapping a table with no open
   session calls `POST /api/sessions` then routes to `/table/[id]`; tapping
   an occupied table routes straight to `/table/[id]`.
2. `/table/[id]` — session detail. Claude writes this route file *thin*: it
   fetches the session + area config, then renders either
   `<TimedSessionView>` (snooker/playstation) or `<ProductOnlySessionView>`
   (cards) based on `area.hourlyRate !== null`. The two view components are
   owned by Minimax A/B respectively (see below) — Claude never writes their
   internals.
3. `/history` — list + filter of closed sessions, each expandable to its
   bill breakdown.
4. `/products` — manage categories/products (add, edit price, remove).

## File ownership (zero overlap, all four can start together)

```
lib/types.ts            <- Claude (extend existing)
lib/config.ts            <- Claude (extend: hourlyRate per area, seed categories/products)
lib/store.ts              <- Claude (extend: items, close, history cache)
lib/billing.ts             <- Claude (new)
lib/db.ts                   <- Claude (new)
app/api/**                   <- Claude (all routes above)
app/page.tsx                  <- Claude (composition only, unchanged pattern)
app/table/[id]/page.tsx        <- Claude (thin — picks TimedSessionView vs ProductOnlySessionView)
app/layout.tsx, globals.css     <- Claude

components/floor/SnookerArea.tsx      <- Minimax (refine existing file)
components/floor/PlaystationArea.tsx   <- Minimax (refine existing file)
components/session/TimedSessionView.tsx <- Minimax (new — timer, hourly rate display, product picker, running total, Close & Bill button)

components/floor/CardsArea.tsx          <- Minimax (refine existing file)
components/session/ProductOnlySessionView.tsx <- Minimax (new — product picker, running total, Close & Bill button, no timer)
app/history/page.tsx + components/history/HistoryList.tsx <- Minimax (new)
app/products/page.tsx + components/products/ProductManager.tsx <- Minimax (new)

(All of the above are one Minimax session working through them in order —
not two parallel windows.)

tests/**                    <- Qwen (unit tests for computeBill, store; one route test for /api/sessions/close math)
scripts/seed.ts               <- Qwen (seeds categories/products into SQLite per schema above)
.eslintrc / .prettierrc         <- Qwen
README.md update                 <- Qwen
.env.example                      <- Qwen
package.json scripts (test/lint/format only) <- Qwen
```

Same rule as phase 1: Claude runs first (extends the shared contract +
`npm install better-sqlite3` + one commit), then all three others start in
parallel — the contract above is already fully specified in text so nobody
needs to wait on a file that doesn't exist yet.

## Copy-paste prompts for the new coding session

> Prompts below are in English (Arabic output quality was poor on the
> Minimax/Qwen backends — user request). Chat with the user stays Arabic;
> only text handed to the other agents is English.

### 1) Claude Code

```
Open the project at c:\Users\Muhammed\Desktop\nour (a Next.js scaffold already
exists on master — do not re-init, extend it). Do exactly this:

1. npm install better-sqlite3 @types/better-sqlite3
2. Extend lib/types.ts: add Category, Product, SessionItem, and update
   GroupSession to include items: SessionItem[], label?: string,
   closedAt?: string, billedTotal?: number
3. Extend lib/config.ts: each AreaConfig gets hourlyRate: number | null
   (snooker/playstation = a number, cards = null). Add default seed
   categories + products.
4. lib/billing.ts (new file): computeBill(session, area, closedAt?) returning
   {productsTotal, timeCost, elapsedMinutes, total} — timeCost = 0 when
   hourlyRate is null.
5. lib/db.ts (new file): set up better-sqlite3 at data/floor.db (add data/ to
   .gitignore) with tables categories, products, sessions, session_items per
   the schema in the plan.
6. app/api/sessions, app/api/sessions/[id], app/api/sessions/[id]/items,
   app/api/sessions/[id]/items/[itemId], app/api/sessions/[id]/close,
   app/api/history, app/api/products — implement each route per the table in
   the plan.
7. app/table/[id]/page.tsx: thin file only — fetches the session + area
   config, renders TimedSessionView or ProductOnlySessionView based on
   hourlyRate (import from "@/components/session/TimedSessionView" and
   "@/components/session/ProductOnlySessionView" — they don't exist yet,
   another team builds them in parallel; don't write their internals).
8. app/page.tsx: tapping a table with no open session should POST
   /api/sessions then route to /table/[id].

Do not touch any file inside components/floor/*, components/session/*,
components/history/*, components/products/*, tests/, scripts/seed.ts,
.eslintrc, .prettierrc, README.md, .env.example — other teams are working on
those at the same time.

After all this: npm run build must pass, then one commit. This is the only
step that must precede the other three on disk (it creates lib/db.ts and
lib/billing.ts they logically depend on — but every contract is already
fully specified in text above, so nobody actually needs to wait on you to
start writing).

Finish the entire task end-to-end without stopping to ask questions — pick
the sane default and keep going.
```

### 2) Minimax — one window, all UI screens in sequence

```
Next.js project (TypeScript, Tailwind, App Router) at
c:\Users\Muhammed\Desktop\nour. Touch ONLY these files (do not touch app/api,
lib/, tests/, scripts/ — other teams own those):
- components/floor/SnookerArea.tsx
- components/floor/PlaystationArea.tsx
- components/floor/CardsArea.tsx
- components/session/TimedSessionView.tsx (new file)
- components/session/ProductOnlySessionView.tsx (new file)
- app/history/page.tsx + components/history/HistoryList.tsx (new files)
- app/products/page.tsx + components/products/ProductManager.tsx (new files)

Build them in this order (each one building on the same visual language):

Contract (do not change it; import from "@/lib/types" once available, and
use this shape in the meantime):
GroupSession { id, area, tableNumber, label?, openedAt, closedAt?, status, items: {productId,name,price,qty}[], billedTotal? }
AreaConfig { area, label, tableCount, hourlyRate: number|null }
BillBreakdown { productsTotal, timeCost, elapsedMinutes, total }

1. SnookerArea.tsx + PlaystationArea.tsx (floor-screen table grid, table
   count comes from config — never assume it's fixed): each table links via
   Next Link to /table/[id]. Open-session counter at the top. Busy, high-
   contrast design (occupied vs free must read instantly).

2. TimedSessionView.tsx (used by snooker and playstation, both have
   hourlyRate): live elapsed timer (mm:ss or hh:mm) from openedAt, hourly
   rate + approximate accrued time cost, product-category tabs with +/- qty
   buttons, large running total at the bottom, "Close & Bill" button.

3. CardsArea.tsx (cards table grid, same pattern as snooker but no time
   indicator).

4. ProductOnlySessionView.tsx: identical to TimedSessionView but with no
   timer/time cost — products only + total + Close & Bill button.

5. HistoryList.tsx + app/history/page.tsx: list of closed sessions (use mock
   data for now, will be wired to fetch("/api/history") later), each row
   expandable to show the bill breakdown, simple filter by area/date.

6. ProductManager.tsx + app/products/page.tsx: categories + products list,
   add/edit price/remove — local state for now, API wiring comes later.

Tailwind only everywhere, large touch targets (tablet, touch-first), colors
consistent across every screen.

Finish the entire task end-to-end without stopping to ask questions — pick
the sane default and keep going.
```

### 3) Qwen — support / infrastructure window

```
Same project. Do not touch app/, lib/, components/ — other teams own those.

Do:
- tests/billing.test.ts: unit tests for computeBill (assume the signature
  from the plan: computeBill(session, area, closedAt?) ->
  {productsTotal, timeCost, elapsedMinutes, total}). Cover: an area with no
  hourlyRate (timeCost=0), an area with hourlyRate (correct math for e.g. 1.5
  hours).
- scripts/seed.ts: seeds default categories + products into data/floor.db via
  better-sqlite3 (assume schema: categories(id,name,order),
  products(id,category_id,name,price)).
- .eslintrc.json + .prettierrc: standard Next.js + TypeScript config.
- Update README.md: full description of the system (phase 1 + the new
  features), how to run it, how to seed data, how to run tests.
- .env.example: any env vars expected.
- package.json: add "test" and "seed" scripts only (do not touch existing
  dependencies).

Wait for the first commit from the init team (Claude) before running anything
that actually depends on lib/db.ts, but write the tests now directly against
the documented contract.

Finish the entire task end-to-end without stopping to ask questions — pick
the sane default and keep going.
```

## Verification (once the new session finishes all four)

- `npm run build` clean.
- `npm test` green (billing math correct for both hourly and product-only areas).
- Open a snooker table → timer visible → add products → close → bill total
  matches `productsTotal + timeCost` by hand-check.
- Open a cards table → no timer → add products → close → bill = productsTotal only.
- `/history` shows both closed sessions with correct breakdowns.
- Restart the dev server → history persists (proves SQLite persistence works,
  not just in-memory state).
