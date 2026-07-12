import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { AreaConfig, AreaType, Category, GroupSession, Product, SessionItem } from "./types";
import { AREA_CONFIG, SEED_CATEGORIES, SEED_PRODUCTS } from "./config";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "floor.db");

declare global {
  // eslint-disable-next-line no-var
  var __floorDb: Database.Database | undefined;
}

function createConnection(): Database.Database {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("busy_timeout = 5000");
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      area TEXT NOT NULL,
      table_number INTEGER NOT NULL,
      label TEXT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      status TEXT NOT NULL,
      billed_total REAL
    );
    CREATE TABLE IF NOT EXISTS session_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS area_settings (
      area TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      table_count INTEGER NOT NULL,
      hourly_rate REAL
    );
    CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `);

  // `sessions.merged_into` was added after the original schema shipped —
  // `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` in SQLite, so guard it
  // manually against a DB file created before this column existed.
  const sessionColumns = conn.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (!sessionColumns.some((c) => c.name === "merged_into")) {
    conn.exec("ALTER TABLE sessions ADD COLUMN merged_into TEXT");
  }

  // `OR IGNORE` makes this race-safe: Next's build process imports every
  // route module (and this module's top-level init) across several
  // parallel workers, so concurrent first-run seeding is expected.
  const insertCategory = conn.prepare(
    "INSERT OR IGNORE INTO categories (id, name, order_index) VALUES (?, ?, ?)"
  );
  const insertProduct = conn.prepare(
    "INSERT OR IGNORE INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)"
  );
  const insertAreaSettings = conn.prepare(
    "INSERT OR IGNORE INTO area_settings (area, label, table_count, hourly_rate) VALUES (?, ?, ?, ?)"
  );
  const seed = conn.transaction(() => {
    for (const c of SEED_CATEGORIES) insertCategory.run(c.id, c.name, c.order);
    for (const p of SEED_PRODUCTS) insertProduct.run(p.id, p.categoryId, p.name, p.price);
    for (const a of AREA_CONFIG) insertAreaSettings.run(a.area, a.label, a.tableCount, a.hourlyRate);
  });
  seed();

  return conn;
}

// Lazy singleton: the connection (file create + schema + seed) must not run
// at module-import time. Next's build "collect page data" step `require()`s
// every route module across several parallel workers just to inspect their
// exports, without invoking any handler — eagerly opening the DB here would
// race multiple processes against the same SQLite file during that step.
// The Proxy defers the real `createConnection()` call to the first actual
// query, which only ever happens inside a request handler at runtime.
function getDb(): Database.Database {
  if (!globalThis.__floorDb) {
    globalThis.__floorDb = createConnection();
  }
  return globalThis.__floorDb;
}

const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

// ---- rows ----

interface SessionRow {
  id: string;
  area: AreaType;
  table_number: number;
  label: string | null;
  opened_at: string;
  closed_at: string | null;
  status: "open" | "closed";
  billed_total: number | null;
  merged_into: string | null;
}

interface SessionItemRow {
  id: string;
  session_id: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
}

interface ProductRow {
  id: string;
  category_id: string;
  name: string;
  price: number;
}

interface CategoryRow {
  id: string;
  name: string;
  order_index: number;
}

interface AreaSettingsRow {
  area: AreaType;
  label: string;
  table_count: number;
  hourly_rate: number | null;
}

function rowToSession(row: SessionRow, items: SessionItemRow[]): GroupSession {
  return {
    id: row.id,
    area: row.area,
    tableNumber: row.table_number,
    label: row.label ?? undefined,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    status: row.status,
    items: items.map(rowToSessionItem),
    billedTotal: row.billed_total ?? undefined,
    mergedInto: row.merged_into ?? undefined,
  };
}

function rowToSessionItem(row: SessionItemRow): SessionItem {
  return { productId: row.product_id, name: row.name, price: row.price, qty: row.qty };
}

function rowToProduct(row: ProductRow): Product {
  return { id: row.id, categoryId: row.category_id, name: row.name, price: row.price };
}

function rowToCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, order: row.order_index };
}

function rowToAreaSettings(row: AreaSettingsRow): AreaConfig {
  return { area: row.area, label: row.label, tableCount: row.table_count, hourlyRate: row.hourly_rate };
}

function getItemsForSession(sessionId: string): SessionItemRow[] {
  return db
    .prepare("SELECT * FROM session_items WHERE session_id = ? ORDER BY rowid")
    .all(sessionId) as SessionItemRow[];
}

// ---- sessions ----

export function listOpenSessions(): GroupSession[] {
  const rows = db.prepare("SELECT * FROM sessions WHERE status = 'open'").all() as SessionRow[];
  return rows.map((r) => rowToSession(r, getItemsForSession(r.id)));
}

export function findOpenSessionForTable(area: AreaType, tableNumber: number): GroupSession | null {
  const row = db
    .prepare("SELECT * FROM sessions WHERE area = ? AND table_number = ? AND status = 'open'")
    .get(area, tableNumber) as SessionRow | undefined;
  if (!row) return null;
  return rowToSession(row, getItemsForSession(row.id));
}

export function createSession(area: AreaType, tableNumber: number): GroupSession {
  const existing = findOpenSessionForTable(area, tableNumber);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const openedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO sessions (id, area, table_number, label, opened_at, closed_at, status, billed_total) VALUES (?, ?, ?, NULL, ?, NULL, 'open', NULL)"
  ).run(id, area, tableNumber, openedAt);
  return { id, area, tableNumber, openedAt, status: "open", items: [] };
}

export function getSessionById(id: string): GroupSession | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  if (!row) return null;
  return rowToSession(row, getItemsForSession(row.id));
}

export function addSessionItem(sessionId: string, productId: string, qty: number): GroupSession | null {
  const session = getSessionById(sessionId);
  if (!session) return null;
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId) as
    | ProductRow
    | undefined;
  if (!product) throw new Error(`No product found for id: ${productId}`);

  const existing = db
    .prepare("SELECT * FROM session_items WHERE session_id = ? AND product_id = ?")
    .get(sessionId, productId) as SessionItemRow | undefined;

  if (existing) {
    db.prepare("UPDATE session_items SET qty = qty + ? WHERE id = ?").run(qty, existing.id);
  } else {
    db.prepare(
      "INSERT INTO session_items (id, session_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), sessionId, productId, product.name, product.price, qty);
  }
  return getSessionById(sessionId);
}

export function updateSessionItemQty(sessionId: string, itemId: string, qty: number): GroupSession | null {
  if (qty <= 0) {
    db.prepare("DELETE FROM session_items WHERE id = ? AND session_id = ?").run(itemId, sessionId);
  } else {
    db.prepare("UPDATE session_items SET qty = ? WHERE id = ? AND session_id = ?").run(
      qty,
      itemId,
      sessionId
    );
  }
  return getSessionById(sessionId);
}

export function deleteSessionItem(sessionId: string, itemId: string): GroupSession | null {
  db.prepare("DELETE FROM session_items WHERE id = ? AND session_id = ?").run(itemId, sessionId);
  return getSessionById(sessionId);
}

export function replaceSessionItemsAndLabel(
  sessionId: string,
  items?: SessionItem[],
  label?: string
): GroupSession | null {
  const session = getSessionById(sessionId);
  if (!session) return null;

  const tx = db.transaction(() => {
    if (items) {
      db.prepare("DELETE FROM session_items WHERE session_id = ?").run(sessionId);
      const insert = db.prepare(
        "INSERT INTO session_items (id, session_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const item of items) {
        insert.run(crypto.randomUUID(), sessionId, item.productId, item.name, item.price, item.qty);
      }
    }
    if (label !== undefined) {
      db.prepare("UPDATE sessions SET label = ? WHERE id = ?").run(label, sessionId);
    }
  });
  tx();

  return getSessionById(sessionId);
}

export function closeSession(
  sessionId: string,
  closedAt: string,
  billedTotal: number
): GroupSession | null {
  db.prepare(
    "UPDATE sessions SET status = 'closed', closed_at = ?, billed_total = ? WHERE id = ?"
  ).run(closedAt, billedTotal, sessionId);
  return getSessionById(sessionId);
}

/** Moves an OPEN session to a different table number within its own area. */
export function transferSession(sessionId: string, newTableNumber: number): GroupSession {
  const tx = db.transaction(() => {
    const session = getSessionById(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "open") throw new Error("Cannot transfer a closed session");

    const clash = db
      .prepare(
        "SELECT id FROM sessions WHERE area = ? AND table_number = ? AND status = 'open' AND id != ?"
      )
      .get(session.area, newTableNumber, sessionId) as { id: string } | undefined;
    if (clash) throw new Error(`Table ${newTableNumber} already has an open session`);

    db.prepare("UPDATE sessions SET table_number = ? WHERE id = ?").run(newTableNumber, sessionId);
  });
  tx();
  return getSessionById(sessionId) as GroupSession;
}

/**
 * Merges `fromSessionId`'s items into `intoSessionId` (same qty-merge rule
 * as `addSessionItem`), then closes `fromSessionId` with billedTotal=0 and
 * `merged_into` pointing at the target session.
 */
export function mergeSessions(intoSessionId: string, fromSessionId: string): GroupSession {
  if (intoSessionId === fromSessionId) throw new Error("Cannot merge a session into itself");

  const tx = db.transaction(() => {
    const into = getSessionById(intoSessionId);
    const from = getSessionById(fromSessionId);
    if (!into) throw new Error("Target session not found");
    if (!from) throw new Error("Source session not found");
    if (into.status !== "open" || from.status !== "open") {
      throw new Error("Both sessions must be open to merge");
    }
    if (into.area !== from.area) {
      throw new Error("Cannot merge sessions from different areas");
    }

    for (const item of from.items) {
      const existing = db
        .prepare("SELECT * FROM session_items WHERE session_id = ? AND product_id = ?")
        .get(intoSessionId, item.productId) as SessionItemRow | undefined;
      if (existing) {
        db.prepare("UPDATE session_items SET qty = qty + ? WHERE id = ?").run(item.qty, existing.id);
      } else {
        db.prepare(
          "INSERT INTO session_items (id, session_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(crypto.randomUUID(), intoSessionId, item.productId, item.name, item.price, item.qty);
      }
    }
    db.prepare("DELETE FROM session_items WHERE session_id = ?").run(fromSessionId);
    db.prepare(
      "UPDATE sessions SET status = 'closed', closed_at = ?, billed_total = 0, merged_into = ? WHERE id = ?"
    ).run(new Date().toISOString(), intoSessionId, fromSessionId);
  });
  tx();

  return getSessionById(intoSessionId) as GroupSession;
}

export interface HistoryFilter {
  area?: AreaType;
  from?: string;
  to?: string;
  /** Case-insensitive partial match against the session's customer label. */
  label?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_HISTORY_LIMIT = 100;

function buildHistoryClauses(
  filter: Omit<HistoryFilter, "limit" | "offset">
): { clauses: string[]; params: (string | number)[] } {
  const clauses = ["status = 'closed'"];
  const params: (string | number)[] = [];
  if (filter.area) {
    clauses.push("area = ?");
    params.push(filter.area);
  }
  if (filter.from) {
    clauses.push("closed_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    clauses.push("closed_at <= ?");
    params.push(filter.to);
  }
  if (filter.label) {
    clauses.push("LOWER(label) LIKE LOWER(?) ESCAPE '\\'");
    const escaped = filter.label.replace(/[\\%_]/g, "\\$&");
    params.push(`%${escaped}%`);
  }
  return { clauses, params };
}

export function listHistory(filter: HistoryFilter): GroupSession[] {
  const { clauses, params } = buildHistoryClauses(filter);
  const limit = filter.limit ?? DEFAULT_HISTORY_LIMIT;
  const offset = filter.offset ?? 0;
  // `rowid DESC` tiebreaker: closed_at has millisecond precision, and two
  // sessions can legitimately close within the same millisecond (synchronous
  // in-process SQLite calls are easily sub-millisecond apart). Without a
  // stable secondary key, ties sort arbitrarily — rows could shift between
  // pages on repeated queries with identical filters, which breaks
  // pagination's basic guarantee (a stable, repeatable ordering).
  const rows = db
    .prepare(
      `SELECT * FROM sessions WHERE ${clauses.join(" AND ")} ORDER BY closed_at DESC, rowid DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as SessionRow[];
  return rows.map((r) => rowToSession(r, getItemsForSession(r.id)));
}

/** Total matching rows for `filter`, ignoring limit/offset — pairs with listHistory() for pagination. */
export function countHistory(filter: Omit<HistoryFilter, "limit" | "offset">): number {
  const { clauses, params } = buildHistoryClauses(filter);
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM sessions WHERE ${clauses.join(" AND ")}`)
    .get(...params) as { count: number };
  return row.count;
}

// ---- catalog ----

export function listCategories(): Category[] {
  const rows = db.prepare("SELECT * FROM categories ORDER BY order_index").all() as CategoryRow[];
  return rows.map(rowToCategory);
}

export function listProducts(): Product[] {
  const rows = db.prepare("SELECT * FROM products ORDER BY rowid").all() as ProductRow[];
  return rows.map(rowToProduct);
}

export function createProduct(categoryId: string, name: string, price: number): Product {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run(
    id,
    categoryId,
    name,
    price
  );
  return { id, categoryId, name, price };
}

export function updateProduct(
  id: string,
  fields: { name?: string; price?: number; categoryId?: string }
): Product | null {
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  if (!row) return null;
  const name = fields.name ?? row.name;
  const price = fields.price ?? row.price;
  const categoryId = fields.categoryId ?? row.category_id;
  db.prepare("UPDATE products SET name = ?, price = ?, category_id = ? WHERE id = ?").run(
    name,
    price,
    categoryId,
    id
  );
  return { id, categoryId, name, price };
}

export function deleteProduct(id: string): void {
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

export function createCategory(name: string, order: number): Category {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO categories (id, name, order_index) VALUES (?, ?, ?)").run(id, name, order);
  return { id, name, order };
}

export function deleteCategory(id: string): void {
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

// ---- area settings ----
// DB-backed, editable replacement for the hardcoded lib/config.ts#AREA_CONFIG
// constant (which remains only as seed data for first-run insertion above).

export function getAreaSettings(area: AreaType): AreaConfig {
  const row = db.prepare("SELECT * FROM area_settings WHERE area = ?").get(area) as
    | AreaSettingsRow
    | undefined;
  if (!row) throw new Error(`No area settings found for area: ${area}`);
  return rowToAreaSettings(row);
}

export function listAreaSettings(): AreaConfig[] {
  const rows = db.prepare("SELECT * FROM area_settings ORDER BY rowid").all() as AreaSettingsRow[];
  return rows.map(rowToAreaSettings);
}

export function updateAreaSettings(
  area: AreaType,
  fields: { tableCount?: number; hourlyRate?: number | null; label?: string }
): AreaConfig {
  const tx = db.transaction(() => {
    const current = getAreaSettings(area);

    if (fields.tableCount !== undefined && fields.tableCount < current.tableCount) {
      const openAbove = db
        .prepare(
          "SELECT MAX(table_number) as maxTable FROM sessions WHERE area = ? AND status = 'open' AND table_number > ?"
        )
        .get(area, fields.tableCount) as { maxTable: number | null };
      if (openAbove.maxTable !== null) {
        throw new Error(
          `Cannot reduce table count to ${fields.tableCount}: table ${openAbove.maxTable} has an open session`
        );
      }
    }

    const label = fields.label ?? current.label;
    const tableCount = fields.tableCount ?? current.tableCount;
    const hourlyRate = fields.hourlyRate !== undefined ? fields.hourlyRate : current.hourlyRate;

    db.prepare(
      "UPDATE area_settings SET label = ?, table_count = ?, hourly_rate = ? WHERE area = ?"
    ).run(label, tableCount, hourlyRate, area);
  });
  tx();

  return getAreaSettings(area);
}

export default db;
