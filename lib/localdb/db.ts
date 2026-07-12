import initSqlJs, { Database, BindParams, SqlValue, SqlJsStatic } from "sql.js";
import { AREA_CONFIG, SEED_CATEGORIES, SEED_PRODUCTS } from "../config";

/**
 * sql.js + IndexedDB, not wa-sqlite + OPFS.
 *
 * wa-sqlite's fast OPFS VFS (SyncAccessHandle) needs the page to be
 * cross-origin isolated (`crossOriginIsolated === true`, via
 * Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy response
 * headers) — confirmed by a real headless-browser test against a plain
 * static file server: `createSyncAccessHandle` doesn't exist without it.
 * This app ships as `output: "export"` (no server at all, ever — that's
 * the whole point of going offline), and Next's static export explicitly
 * does not support custom response headers. There is structurally no way
 * to serve the COOP/COEP headers OPFS's fast path needs, so wa-sqlite
 * would be stuck on its slower non-SAH VFS anyway — at which point it has
 * no real advantage over sql.js while adding a WASM VFS registration
 * ceremony. sql.js + IndexedDB has no header dependency at all and is the
 * far more mature, simpler integration for a single shop's data volume
 * (thousands of rows over months, not millions).
 *
 * Design: `initLocalDb()` is awaited once at app start — it loads the
 * WASM module, restores the last-persisted bytes from IndexedDB (or
 * creates a fresh DB), and caches the resulting synchronous `Database`
 * instance. Every other function in lib/localdb/ is fully SYNCHRONOUS
 * after that (matching the old lib/db.ts's better-sqlite3-shaped API
 * exactly) — mutations schedule a debounced background persist rather
 * than blocking the caller on IndexedDB I/O.
 */

const IDB_NAME = "floor-local-db";
const IDB_STORE = "sqlite";
const IDB_KEY = "main";
const PERSIST_DEBOUNCE_MS = 200;

let dbInstance: Database | null = null;
let sqlStatic: SqlJsStatic | null = null;
let initPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function isBrowser(): boolean {
  return typeof indexedDB !== "undefined";
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadPersistedBytes(): Promise<Uint8Array | null> {
  const idb = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => idb.close();
  });
}

async function savePersistedBytes(bytes: Uint8Array): Promise<void> {
  const idb = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Debounced background persist — mutations call this, nothing awaits it. */
export function schedulePersist(): void {
  if (!isBrowser() || !dbInstance) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!dbInstance) return;
    const bytes = dbInstance.export();
    void savePersistedBytes(bytes);
  }, PERSIST_DEBOUNCE_MS);
}

/** Forces the pending debounced persist to run immediately (e.g. before unload). */
export async function flushPersist(): Promise<void> {
  if (!isBrowser() || !dbInstance) return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await savePersistedBytes(dbInstance.export());
}

export async function initLocalDb(): Promise<void> {
  if (dbInstance) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Browser path only — tests never call initLocalDb() at all, they build
    // their own sql.js Database directly and inject it via
    // __setDbForTesting(), so there's no Node-side locateFile branch to keep
    // here. (Keeping one would make webpack try to statically analyze a
    // `require.resolve` in code that ships to the client bundle.)
    const SQL = await initSqlJs({ locateFile: (file: string) => `/sql-wasm/${file}` });
    sqlStatic = SQL;

    const bytes = isBrowser() ? await loadPersistedBytes() : null;
    dbInstance = bytes ? new SQL.Database(bytes) : new SQL.Database();
    runMigrations(dbInstance);
    seedIfEmpty(dbInstance);
  })();
  await initPromise;
}

/**
 * Replaces the live DB wholesale with an imported snapshot (backup/restore
 * flow) — validates by construction: `new Database(bytes)` throws if the
 * bytes aren't a real SQLite file, which the caller surfaces as an error.
 * Runs migrations defensively (in case the snapshot predates a schema
 * change) then persists immediately so the replacement survives a reload.
 */
export async function replaceDatabase(bytes: Uint8Array): Promise<void> {
  await initLocalDb();
  if (!sqlStatic) throw new Error("SQL module not loaded");
  dbInstance = new sqlStatic.Database(bytes);
  runMigrations(dbInstance);
  await flushPersist();
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error("Local DB not initialized — call initLocalDb() first");
  }
  return dbInstance;
}

/** Test-only seam: inject an already-constructed sql.js Database directly. */
export function __setDbForTesting(db: Database): void {
  dbInstance = db;
}

function runMigrations(db: Database): void {
  db.run(`
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
      billed_total REAL,
      merged_into TEXT
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
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `);
}

/** First-run seed — safe to call every init since it's all `INSERT OR IGNORE`. */
function seedIfEmpty(db: Database): void {
  db.run("BEGIN");
  try {
    for (const c of SEED_CATEGORIES) {
      db.run("INSERT OR IGNORE INTO categories (id, name, order_index) VALUES (?, ?, ?)", [
        c.id,
        c.name,
        c.order,
      ]);
    }
    for (const p of SEED_PRODUCTS) {
      db.run("INSERT OR IGNORE INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)", [
        p.id,
        p.categoryId,
        p.name,
        p.price,
      ]);
    }
    for (const a of AREA_CONFIG) {
      db.run(
        "INSERT OR IGNORE INTO area_settings (area, label, table_count, hourly_rate) VALUES (?, ?, ?, ?)",
        [a.area, a.label, a.tableCount, a.hourlyRate]
      );
    }
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// better-sqlite3-shaped query helpers over sql.js's step/getAsObject API —
// keeps the port in lib/localdb/index.ts mechanical (same call shape as the
// old lib/db.ts) instead of hand-rolling stmt.step() loops at every call site.
// ---------------------------------------------------------------------------

export type Row = Record<string, SqlValue>;

export function queryAll<T = Row>(sql: string, params: BindParams = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

export function queryOne<T = Row>(sql: string, params: BindParams = []): T | undefined {
  return queryAll<T>(sql, params)[0];
}

/** Mutating statement (INSERT/UPDATE/DELETE) — schedules a background persist. */
export function exec(sql: string, params: BindParams = []): void {
  getDb().run(sql, params);
  schedulePersist();
}

/** Multiple mutating statements as one unit — sql.js has no explicit BEGIN/COMMIT
 *  needed for correctness here (single-threaded, single-tab access), but wrapping
 *  in a transaction still gives us atomic rollback if a statement throws mid-way. */
export function transaction(fn: () => void): void {
  const db = getDb();
  db.run("BEGIN");
  try {
    fn();
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    throw err;
  }
  schedulePersist();
}
