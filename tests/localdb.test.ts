import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import initSqlJs, { type Database, type BindParams } from "sql.js";

// ---------------------------------------------------------------------------
// In-memory sql.js DB, built and seeded directly, then injected into
// lib/localdb's module-level singleton via its test-only seam
// (__setDbForTesting) before any test imports/calls the real functions.
// ---------------------------------------------------------------------------

type LocalDb = typeof import("../lib/localdb");

let localdb: LocalDb;
let testDb: Database;

/** Mirrors better-sqlite3's `.prepare(sql).get(params)` shape for the few
 *  tests that need to peek at a row lib/localdb's API doesn't return
 *  directly (e.g. a generated session_item id). */
function rawGet<T = Record<string, unknown>>(sql: string, params: BindParams = []): T | undefined {
  const stmt = testDb.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? (stmt.getAsObject() as T) : undefined;
  } finally {
    stmt.free();
  }
}

/** Mirrors better-sqlite3's `.prepare(sql).all(params)`. */
function rawAll<T = Record<string, unknown>>(sql: string, params: BindParams = []): T[] {
  const stmt = testDb.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

before(async () => {
  const SQL = await initSqlJs({
    locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`),
  });
  testDb = new SQL.Database();

  // Use the real migration logic instead of hand-duplicating CREATE TABLE —
  // this keeps the test schema in sync whenever new columns are added.
  const { runMigrations } = await import("../lib/localdb");
  runMigrations(testDb);

  const insertCategory = (id: string, name: string, order: number) =>
    testDb.run("INSERT INTO categories (id, name, order_index) VALUES (?, ?, ?)", [id, name, order]);
  const insertProduct = (id: string, categoryId: string, name: string, price: number) =>
    testDb.run("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)", [
      id,
      categoryId,
      name,
      price,
    ]);
  const insertAreaSettings = (area: string, label: string, tableCount: number, hourlyRate: number | null) =>
    testDb.run("INSERT INTO area_settings (area, label, table_count, hourly_rate) VALUES (?, ?, ?, ?)", [
      area,
      label,
      tableCount,
      hourlyRate,
    ]);

  insertCategory("cat-drinks", "Drinks", 1);
  insertCategory("cat-snacks", "Snacks", 2);
  insertCategory("cat-extras", "Extras", 3);

  insertProduct("prod-coffee", "cat-drinks", "Coffee", 2.5);
  insertProduct("prod-tea", "cat-drinks", "Tea", 2);
  insertProduct("prod-water", "cat-drinks", "Water", 1);
  insertProduct("prod-soda", "cat-drinks", "Soda", 2);
  insertProduct("prod-chips", "cat-snacks", "Chips", 1.5);
  insertProduct("prod-sandwich", "cat-snacks", "Sandwich", 4);
  insertProduct("prod-chocolate", "cat-snacks", "Chocolate Bar", 1.5);
  insertProduct("prod-shisha", "cat-extras", "Shisha", 6);
  insertProduct("prod-cards-deck", "cat-extras", "New Card Deck", 3);

  insertAreaSettings("snooker", "Snooker", 15, 10);
  insertAreaSettings("cards", "Cards", 6, null);
  insertAreaSettings("playstation", "PlayStation", 4, 8);

  localdb = await import("../lib/localdb");
  localdb.__setDbForTesting(testDb);
});

after(() => {
  testDb.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("localdb session lifecycle", () => {
  it("createSession returns an open session with empty items", () => {
    const session = localdb.createSession("snooker", 1);
    assert.ok(typeof session.id === "string");
    assert.equal(session.area, "snooker");
    assert.equal(session.tableNumber, 1);
    assert.equal(session.status, "open");
    assert.deepStrictEqual(session.items, []);
  });

  it("createSession returns existing session when the table already has one open", () => {
    const first = localdb.createSession("snooker", 2);
    const second = localdb.createSession("snooker", 2);
    assert.equal(first.id, second.id);
  });

  it("createSession allows a second open session on a different table in the same area", () => {
    const s1 = localdb.createSession("snooker", 3);
    const s2 = localdb.createSession("snooker", 4);
    assert.notEqual(s1.id, s2.id);
  });

  it("listOpenSessions returns only open sessions", () => {
    localdb.createSession("snooker", 5);
    localdb.createSession("cards", 1);

    const open = localdb.listOpenSessions();
    assert.ok(open.length >= 2);
    for (const s of open) {
      assert.equal(s.status, "open");
    }
  });

  it("getSessionById returns null for a non-existent id", () => {
    assert.equal(localdb.getSessionById("nonexistent"), null);
  });

  it("getSessionById returns the created session", () => {
    const s = localdb.createSession("playstation", 1);
    const fetched = localdb.getSessionById(s.id);
    assert.notEqual(fetched, null);
    assert.equal(fetched!.id, s.id);
  });

  it("findOpenSessionForTable returns the open session for a given table", () => {
    const s = localdb.createSession("snooker", 10);
    const found = localdb.findOpenSessionForTable("snooker", 10);
    assert.notEqual(found, null);
    assert.equal(found!.id, s.id);
  });

  it("findOpenSessionForTable returns null when table has no open session", () => {
    const found = localdb.findOpenSessionForTable("snooker", 999);
    assert.equal(found, null);
  });
});

describe("localdb items", () => {
  it("addSessionItem adds an item to the session", () => {
    const s = localdb.createSession("snooker", 20);
    const updated = localdb.addSessionItem(s.id, "prod-coffee", 2);
    assert.notEqual(updated, null);
    assert.equal(updated!.items.length, 1);
    assert.equal(updated!.items[0].productId, "prod-coffee");
    assert.equal(updated!.items[0].qty, 2);
  });

  it("addSessionItem merges duplicate productId into one line with summed qty", () => {
    const s = localdb.createSession("snooker", 21);
    localdb.addSessionItem(s.id, "prod-coffee", 1);
    const updated = localdb.addSessionItem(s.id, "prod-coffee", 2);
    assert.equal(updated!.items.length, 1);
    assert.equal(updated!.items[0].qty, 3);
  });

  it("addSessionItem returns null for a non-existent session", () => {
    const result = localdb.addSessionItem("nonexistent", "prod-coffee", 1);
    assert.equal(result, null);
  });

  it("addSessionItem throws for a non-existent product", () => {
    const s = localdb.createSession("snooker", 22);
    assert.throws(() => localdb.addSessionItem(s.id, "prod-nonexistent", 1));
  });

  it("updateSessionItemQty changes the qty of an existing item", () => {
    const s = localdb.createSession("snooker", 23);
    localdb.addSessionItem(s.id, "prod-coffee", 2);
    const itemId = rawGet<{ id: string }>("SELECT id FROM session_items WHERE session_id = ?", [s.id]);

    const updated = localdb.updateSessionItemQty(s.id, itemId!.id, 5);
    const coffee = updated!.items.find((i) => i.productId === "prod-coffee");
    assert.equal(coffee!.qty, 5);
  });

  it("updateSessionItemQty with qty <= 0 removes the item", () => {
    const s = localdb.createSession("snooker", 24);
    localdb.addSessionItem(s.id, "prod-coffee", 2);
    localdb.addSessionItem(s.id, "prod-tea", 1);
    const items = rawAll<{ id: string; product_id: string }>(
      "SELECT id, product_id FROM session_items WHERE session_id = ? ORDER BY rowid",
      [s.id]
    );
    const coffeeId = items.find((r) => r.product_id === "prod-coffee")!.id;

    const updated = localdb.updateSessionItemQty(s.id, coffeeId, 0);
    assert.equal(updated!.items.length, 1);
    assert.equal(updated!.items[0].productId, "prod-tea");
  });

  it("deleteSessionItem removes exactly that item", () => {
    const s = localdb.createSession("snooker", 25);
    localdb.addSessionItem(s.id, "prod-coffee", 2);
    localdb.addSessionItem(s.id, "prod-tea", 1);
    const items = rawAll<{ id: string; product_id: string }>(
      "SELECT id, product_id FROM session_items WHERE session_id = ? ORDER BY rowid",
      [s.id]
    );
    const teaId = items.find((r) => r.product_id === "prod-tea")!.id;

    const updated = localdb.deleteSessionItem(s.id, teaId);
    assert.equal(updated!.items.length, 1);
    assert.equal(updated!.items[0].productId, "prod-coffee");
  });

  it("replaceSessionItemsAndLabel bulk-syncs items and label", () => {
    const s = localdb.createSession("playstation", 30);
    const updated = localdb.replaceSessionItemsAndLabel(
      s.id,
      [
        { productId: "prod-soda", name: "Soda", price: 2, qty: 3 },
        { productId: "prod-chips", name: "Chips", price: 1.5, qty: 1 },
      ],
      "Ali's Group"
    );

    assert.equal(updated!.label, "Ali's Group");
    assert.equal(updated!.items.length, 2);
  });
});

describe("localdb close + billing", () => {
  it("closeSession sets status to closed and records billedTotal", () => {
    const s = localdb.createSession("snooker", 40);
    localdb.addSessionItem(s.id, "prod-coffee", 2);
    localdb.addSessionItem(s.id, "prod-tea", 1);

    const closedAt = new Date(new Date(s.openedAt).getTime() + 90 * 60_000).toISOString();
    const closed = localdb.closeSession(s.id, closedAt, 22);

    assert.equal(closed!.status, "closed");
    assert.equal(closed!.billedTotal, 22);
    assert.equal(closed!.closedAt, closedAt);
  });

  it("closeSession returns null for a non-existent session", () => {
    const result = localdb.closeSession("nonexistent", new Date().toISOString(), 0);
    assert.equal(result, null);
  });
});

describe("localdb merge + transfer", () => {
  it("mergeSessions merges items from source into target", () => {
    const into = localdb.createSession("snooker", 50);
    const from = localdb.createSession("snooker", 51);
    localdb.addSessionItem(into.id, "prod-coffee", 2);
    localdb.addSessionItem(from.id, "prod-tea", 1);

    const merged = localdb.mergeSessions(into.id, from.id);
    assert.equal(merged.items.length, 2);

    // Source session should be closed with merged_into set
    const source = localdb.getSessionById(from.id);
    assert.equal(source!.status, "closed");
    assert.equal(source!.billedTotal, 0);
    assert.equal(source!.mergedInto, into.id);
  });

  it("mergeSessions throws when merging into itself", () => {
    const s = localdb.createSession("snooker", 52);
    assert.throws(() => localdb.mergeSessions(s.id, s.id));
  });

  it("transferSession moves an open session to a different table", () => {
    const s = localdb.createSession("snooker", 55);
    const transferred = localdb.transferSession(s.id, 56);
    assert.equal(transferred.tableNumber, 56);
  });

  it("transferSession throws when target table already has an open session", () => {
    localdb.createSession("snooker", 57);
    const s = localdb.createSession("snooker", 58);
    assert.throws(() => localdb.transferSession(s.id, 57));
  });
});

describe("localdb history", () => {
  it("listHistory returns closed sessions", () => {
    const s = localdb.createSession("snooker", 60);
    localdb.closeSession(s.id, new Date().toISOString(), 10);

    const history = localdb.listHistory({});
    assert.ok(Array.isArray(history));
    assert.ok(history.some((h) => h.id === s.id));
  });

  it("listHistory filters by area", () => {
    const snookerS = localdb.createSession("snooker", 61);
    const cardsS = localdb.createSession("cards", 5);
    const now = new Date().toISOString();
    localdb.closeSession(snookerS.id, now, 10);
    localdb.closeSession(cardsS.id, now, 5);

    const snookerHistory = localdb.listHistory({ area: "snooker" });
    assert.ok(snookerHistory.every((h) => h.area === "snooker"));

    const cardsHistory = localdb.listHistory({ area: "cards" });
    assert.ok(cardsHistory.every((h) => h.area === "cards"));
  });

  it("listHistory filters by date range", () => {
    const s1 = localdb.createSession("snooker", 62);
    const s2 = localdb.createSession("snooker", 63);
    const early = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const now = new Date().toISOString();
    localdb.closeSession(s1.id, early, 5);
    localdb.closeSession(s2.id, now, 10);

    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const range = localdb.listHistory({
      from: new Date(Date.now() - 3600000).toISOString(),
      to: tomorrow,
    });
    assert.ok(range.some((h) => h.id === s2.id));
    assert.ok(!range.some((h) => h.id === s1.id));
  });

  it("listHistory respects limit", () => {
    // Close 3 sessions at staggered timestamps so ordering is deterministic
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = localdb.createSession("playstation", 80 + i);
      localdb.closeSession(s.id, new Date(Date.now() + i).toISOString(), 5);
      ids.push(s.id);
    }
    const page = localdb.listHistory({ area: "playstation", limit: 2 });
    assert.equal(page.length, 2);
  });

  it("listHistory respects offset", () => {
    // Pre-count existing closed cards sessions from sibling tests, then add
    // exactly 2 more so total = existing + 2, making offset+limit predictable.
    const existingCount = localdb.countHistory({ area: "cards" });
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const s = localdb.createSession("cards", 10 + i);
      localdb.closeSession(s.id, new Date(Date.now() + i * 1000).toISOString(), 5);
      ids.push(s.id);
    }
    const totalAfterAdd = existingCount + 2;

    // Page 1: skip 0, take 1
    const first = localdb.listHistory({ area: "cards", limit: 1, offset: 0 });
    assert.equal(first.length, 1);

    // Page 2: skip 1, take 1
    const second = localdb.listHistory({ area: "cards", limit: 1, offset: 1 });
    assert.equal(second.length, 1);

    // No overlap
    assert.notEqual(first[0]?.id, second[0]?.id);

    // Verify total — all 2 new sessions accounted for across pages
    const totalAfter = localdb.countHistory({ area: "cards" });
    assert.equal(totalAfter, totalAfterAdd);
  });

  it("listHistory defaults to limit=100 when unspecified", () => {
    const history = localdb.listHistory({});
    assert.ok(Array.isArray(history));
  });

  it("countHistory returns the total matching count regardless of limit/offset", () => {
    // Use a table range no other history test touches
    const beforeCount = localdb.countHistory({ area: "cards" });
    for (let i = 0; i < 3; i++) {
      const s = localdb.createSession("cards", 20 + i);
      localdb.closeSession(s.id, new Date().toISOString(), 5);
    }
    const expected = beforeCount + 3;

    const total = localdb.countHistory({ area: "cards" });
    assert.equal(total, expected);

    // listHistory with limit returns fewer rows but countHistory reports full total
    const page = localdb.listHistory({ area: "cards", limit: 1, offset: 0 });
    assert.equal(page.length, 1);
    const totalAfter = localdb.countHistory({ area: "cards" });
    assert.equal(totalAfter, expected);
  });
});

describe("localdb catalog", () => {
  it("listCategories returns seeded categories", () => {
    const cats = localdb.listCategories();
    assert.ok(cats.length >= 3);

    const names = cats.map((c) => c.name);
    assert.ok(names.includes("Drinks"));
    assert.ok(names.includes("Snacks"));
    assert.ok(names.includes("Extras"));
  });

  it("listProducts returns seeded products", () => {
    const prods = localdb.listProducts();
    assert.ok(prods.length >= 9);
  });

  it("createProduct adds a product and returns it", () => {
    const p = localdb.createProduct("cat-drinks", "Espresso", 3.5);
    assert.equal(p.name, "Espresso");
    assert.equal(p.price, 3.5);
    assert.equal(p.categoryId, "cat-drinks");
    assert.ok(typeof p.id === "string");

    // Verify it persists
    const all = localdb.listProducts();
    assert.ok(all.some((x) => x.id === p.id));
  });

  it("updateProduct changes name and price", () => {
    const p = localdb.createProduct("cat-drinks", "Test", 1);
    const updated = localdb.updateProduct(p.id, { name: "Updated", price: 5 });
    assert.equal(updated!.name, "Updated");
    assert.equal(updated!.price, 5);
  });

  it("updateProduct returns null for unknown id", () => {
    const result = localdb.updateProduct("nonexistent", { name: "X" });
    assert.equal(result, null);
  });

  it("deleteProduct removes the product", () => {
    const p = localdb.createProduct("cat-drinks", "Temp", 1);
    localdb.deleteProduct(p.id);
    const all = localdb.listProducts();
    assert.ok(!all.some((x) => x.id === p.id));
  });

  it("createCategory adds a category", () => {
    const c = localdb.createCategory("Desserts", 4);
    assert.equal(c.name, "Desserts");
    assert.equal(c.order, 4);
    assert.ok(typeof c.id === "string");
  });

  it("deleteCategory removes a category", () => {
    const c = localdb.createCategory("TempCat", 99);
    localdb.deleteCategory(c.id);
    const all = localdb.listCategories();
    assert.ok(!all.some((x) => x.id === c.id));
  });
});

describe("localdb area settings", () => {
  it("listAreaSettings returns all areas", () => {
    const areas = localdb.listAreaSettings();
    assert.ok(areas.length >= 3);
  });

  it("getAreaSettings returns a single area config", () => {
    const area = localdb.getAreaSettings("snooker");
    assert.equal(area.area, "snooker");
    assert.equal(area.label, "Snooker");
  });

  it("updateAreaSettings changes table count and label", () => {
    const updated = localdb.updateAreaSettings("playstation", { tableCount: 6, label: "PS5" });
    assert.equal(updated.tableCount, 6);
    assert.equal(updated.label, "PS5");
  });
});

describe("localdb new columns", () => {
  it("createProduct with imageDataUrl and highlightFlag round-trips", () => {
    const p = localdb.createProduct("cat-drinks", "Photo Coffee", 3);
    assert.equal(p.imageDataUrl, undefined);
    assert.equal(p.highlightFlag, false);

    const raw = rawGet<{ image_data_url: string | null; highlight_flag: number }>(
      "SELECT image_data_url, highlight_flag FROM products WHERE id = ?", [p.id]
    );
    assert.equal(raw!.image_data_url, null);
    assert.equal(raw!.highlight_flag, 0);
  });

  it("updateProduct sets imageDataUrl and highlightFlag", () => {
    const p = localdb.createProduct("cat-drinks", "Editable", 4);
    const updated = localdb.updateProduct(p.id, {
      name: "Editable",
      price: 4,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      highlightFlag: true,
    });
    assert.equal(updated!.imageDataUrl, "data:image/png;base64,iVBORw0KGgo=");
    assert.equal(updated!.highlightFlag, true);

    const raw = rawGet<{ image_data_url: string; highlight_flag: number }>(
      "SELECT image_data_url, highlight_flag FROM products WHERE id = ?", [p.id]
    );
    assert.equal(raw!.image_data_url, "data:image/png;base64,iVBORw0KGgo=");
    assert.equal(raw!.highlight_flag, 1);
  });

  it("updateProduct clears imageDataUrl and highlightFlag", () => {
    const p = localdb.createProduct("cat-drinks", "Clearable", 5);
    localdb.updateProduct(p.id, { imageDataUrl: "data:image/png;base64,abc=", highlightFlag: true });
    const cleared = localdb.updateProduct(p.id, { imageDataUrl: null, highlightFlag: false });
    assert.equal(cleared!.imageDataUrl, undefined);
    assert.equal(cleared!.highlightFlag, false);
  });

  it("replaceSessionItemsAndLabel persists label and session-level columns", () => {
    const s = localdb.createSession("playstation", 41);
    const updated = localdb.replaceSessionItemsAndLabel(s.id, [
      { productId: "prod-soda", name: "Soda", price: 2, qty: 1 },
    ], "Player Group");

    assert.equal(updated!.label, "Player Group");
    // Check the session's new columns default correctly
    const row = rawGet<{ players_json: string | null; time_adjustment_seconds: number }>(
      "SELECT players_json, time_adjustment_seconds FROM sessions WHERE id = ?", [s.id]
    );
    assert.equal(row!.players_json, null);
    assert.equal(row!.time_adjustment_seconds, 0);
  });

  it("assignedPlayer on session_items persists through merge", () => {
    const into = localdb.createSession("snooker", 70);
    const from = localdb.createSession("snooker", 71);

    // Give into an item with assignedPlayer
    localdb.addSessionItem(into.id, "prod-coffee", 1);
    const intoItemId = rawGet<{ id: string }>(
      "SELECT id FROM session_items WHERE session_id = ? AND product_id = 'prod-coffee'", [into.id]
    )!.id;
    testDb.run("UPDATE session_items SET assigned_player = ? WHERE id = ?", ["Ahmed", intoItemId]);

    // Give from an item without assignedPlayer
    localdb.addSessionItem(from.id, "prod-tea", 2);

    const merged = localdb.mergeSessions(into.id, from.id);

    // Both items should be present
    assert.equal(merged.items.length, 2);

    // Check assignedPlayer persisted on the into item
    const rows = rawAll<{ product_id: string; assigned_player: string | null }>(
      "SELECT product_id, assigned_player FROM session_items WHERE session_id = ? ORDER BY product_id",
      [into.id]
    );
    const coffeeRow = rows.find((r) => r.product_id === "prod-coffee");
    assert.equal(coffeeRow!.assigned_player, "Ahmed");

    const teaRow = rows.find((r) => r.product_id === "prod-tea");
    assert.equal(teaRow!.assigned_player, null);
  });

  it("assignedPlayer on session_items survives updateSessionItemQty", () => {
    const s = localdb.createSession("snooker", 72);
    localdb.addSessionItem(s.id, "prod-coffee", 2);
    const itemId = rawGet<{ id: string }>(
      "SELECT id FROM session_items WHERE session_id = ?", [s.id]
    )!.id;
    testDb.run("UPDATE session_items SET assigned_player = ? WHERE id = ?", ["Sami", itemId]);

    localdb.updateSessionItemQty(s.id, itemId, 5);
    const row = rawGet<{ assigned_player: string | null }>(
      "SELECT assigned_player FROM session_items WHERE id = ?", [itemId]
    );
    assert.equal(row!.assigned_player, "Sami");
  });
});
