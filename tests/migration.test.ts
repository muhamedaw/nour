import { describe, it } from "node:test";
import assert from "node:assert/strict";
import initSqlJs, { type Database } from "sql.js";
import { runMigrations } from "../lib/localdb";

// ---------------------------------------------------------------------------
// Helper: build a Database with the OLD pre-change schema (no new columns)
// ---------------------------------------------------------------------------

async function createOldSchemaDb(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
  });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, order_index INTEGER NOT NULL
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY, category_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, area TEXT NOT NULL, table_number INTEGER NOT NULL,
      label TEXT, opened_at TEXT NOT NULL, closed_at TEXT, status TEXT NOT NULL,
      billed_total REAL, merged_into TEXT
    );
    CREATE TABLE session_items (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, product_id TEXT NOT NULL,
      name TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL
    );
    CREATE TABLE area_settings (
      area TEXT PRIMARY KEY, label TEXT NOT NULL, table_count INTEGER NOT NULL, hourly_rate REAL
    );
    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE INDEX idx_session_items_session ON session_items(session_id);
    CREATE INDEX idx_sessions_status ON sessions(status);
  `);
  return db;
}

function getColumns(db: Database, table: string): string[] {
  const result = db.exec(`PRAGMA table_info(${table})`);
  if (result.length === 0) return [];
  const nameIdx = result[0].columns.indexOf("name");
  return result[0].values.map((row) => row[nameIdx] as string);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("migration runMigrations", () => {
  it("adds new columns to an old-schema DB", async () => {
    const db = await createOldSchemaDb();

    // Verify old schema has none of the new columns
    let cols = getColumns(db, "products");
    assert.ok(!cols.includes("image_data_url"));
    assert.ok(!cols.includes("highlight_flag"));

    cols = getColumns(db, "sessions");
    assert.ok(!cols.includes("players_json"));
    assert.ok(!cols.includes("time_adjustment_seconds"));
    assert.ok(!cols.includes("split_snapshot_json"));

    cols = getColumns(db, "session_items");
    assert.ok(!cols.includes("assigned_player"));

    // Run migration
    runMigrations(db);

    // Verify new columns exist with correct defaults
    cols = getColumns(db, "products");
    assert.ok(cols.includes("image_data_url"));
    assert.ok(cols.includes("highlight_flag"));

    cols = getColumns(db, "sessions");
    assert.ok(cols.includes("players_json"));
    assert.ok(cols.includes("time_adjustment_seconds"));
    assert.ok(cols.includes("split_snapshot_json"));

    cols = getColumns(db, "session_items");
    assert.ok(cols.includes("assigned_player"));

    // Verify defaults
    db.run("INSERT INTO products (id, category_id, name, price) VALUES ('p1', 'c1', 'Test', 1)");
    const row = db.exec("SELECT highlight_flag FROM products WHERE id = 'p1'");
    assert.equal(row[0].values[0][0], 0);

    db.run("INSERT INTO sessions (id, area, table_number, opened_at, status) VALUES ('s1', 'snooker', 1, '2026-01-01', 'open')");
    const srow = db.exec("SELECT time_adjustment_seconds FROM sessions WHERE id = 's1'");
    assert.equal(srow[0].values[0][0], 0);

    db.close();
  });

  it("is idempotent — second call does not throw", async () => {
    const db = await createOldSchemaDb();
    runMigrations(db);  // first call
    runMigrations(db);  // second call (must not throw)

    // Columns still present
    const cols = getColumns(db, "products");
    assert.ok(cols.includes("image_data_url"));
    assert.ok(cols.includes("highlight_flag"));
    db.close();
  });

  it("runs cleanly on a fresh empty DB", async () => {
    const SQL = await initSqlJs({
      locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
    });
    const db = new SQL.Database();
    // No schema at all — completely fresh
    runMigrations(db);

    // All tables and new columns exist
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tableNames = tables[0].values.map((r) => r[0] as string);
    assert.ok(tableNames.includes("categories"));
    assert.ok(tableNames.includes("products"));
    assert.ok(tableNames.includes("sessions"));
    assert.ok(tableNames.includes("session_items"));
    assert.ok(tableNames.includes("area_settings"));
    assert.ok(tableNames.includes("app_meta"));

    const pcols = getColumns(db, "products");
    assert.ok(pcols.includes("image_data_url"));
    assert.ok(pcols.includes("highlight_flag"));

    const scols = getColumns(db, "sessions");
    assert.ok(scols.includes("players_json"));
    assert.ok(scols.includes("time_adjustment_seconds"));
    assert.ok(scols.includes("split_snapshot_json"));

    const icols = getColumns(db, "session_items");
    assert.ok(icols.includes("assigned_player"));

    db.close();
  });
});
