import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { AreaType, Category, GroupSession, Product, SessionItem } from "./types";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "./config";

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
    CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `);

  // `OR IGNORE` makes this race-safe: Next's build process imports every
  // route module (and this module's top-level init) across several
  // parallel workers, so concurrent first-run seeding is expected.
  const insertCategory = conn.prepare(
    "INSERT OR IGNORE INTO categories (id, name, order_index) VALUES (?, ?, ?)"
  );
  const insertProduct = conn.prepare(
    "INSERT OR IGNORE INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)"
  );
  const seed = conn.transaction(() => {
    for (const c of SEED_CATEGORIES) insertCategory.run(c.id, c.name, c.order);
    for (const p of SEED_PRODUCTS) insertProduct.run(p.id, p.categoryId, p.name, p.price);
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

export interface HistoryFilter {
  area?: AreaType;
  from?: string;
  to?: string;
}

export function listHistory(filter: HistoryFilter): GroupSession[] {
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
  const rows = db
    .prepare(`SELECT * FROM sessions WHERE ${clauses.join(" AND ")} ORDER BY closed_at DESC`)
    .all(...params) as SessionRow[];
  return rows.map((r) => rowToSession(r, getItemsForSession(r.id)));
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

export default db;
