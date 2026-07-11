import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Temp DB setup — must run BEFORE any @/lib/db import so the singleton
// uses our test database instead of data/floor.db.
// ---------------------------------------------------------------------------

const TEMP_DIR = path.join(os.tmpdir(), `nour-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const DB_PATH = path.join(TEMP_DIR, "floor.db");

fs.mkdirSync(TEMP_DIR, { recursive: true });
const testDb = new Database(DB_PATH);
testDb.pragma("busy_timeout = 5000");
testDb.pragma("journal_mode = WAL");

testDb.exec(`
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

const insertCategory = testDb.prepare(
  "INSERT OR IGNORE INTO categories (id, name, order_index) VALUES (?, ?, ?)"
);
const insertProduct = testDb.prepare(
  "INSERT OR IGNORE INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)"
);

const seed = testDb.transaction(() => {
  insertCategory.run("cat-drinks", "Drinks", 1);
  insertCategory.run("cat-snacks", "Snacks", 2);
  insertCategory.run("cat-extras", "Extras", 3);

  insertProduct.run("prod-coffee", "cat-drinks", "Coffee", 2.5);
  insertProduct.run("prod-tea", "cat-drinks", "Tea", 2);
  insertProduct.run("prod-water", "cat-drinks", "Water", 1);
  insertProduct.run("prod-soda", "cat-drinks", "Soda", 2);
  insertProduct.run("prod-chips", "cat-snacks", "Chips", 1.5);
  insertProduct.run("prod-sandwich", "cat-snacks", "Sandwich", 4);
  insertProduct.run("prod-chocolate", "cat-snacks", "Chocolate Bar", 1.5);
  insertProduct.run("prod-shisha", "cat-extras", "Shisha", 6);
  insertProduct.run("prod-cards-deck", "cat-extras", "New Card Deck", 3);
});
seed();

// Inject temp DB into global singleton so @/lib/db picks it up
(globalThis as Record<string, unknown>).__floorDb = testDb;

// ---------------------------------------------------------------------------
// Dynamic imports — only after the global DB is in place.
// ---------------------------------------------------------------------------

let sessionsRoute: typeof import("../app/api/sessions/route");
let sessionByIdRoute: typeof import("../app/api/sessions/[id]/route");
let sessionItemsRoute: typeof import("../app/api/sessions/[id]/items/route");
let sessionItemByIdRoute: typeof import("../app/api/sessions/[id]/items/[itemId]/route");
let sessionCloseRoute: typeof import("../app/api/sessions/[id]/close/route");
let historyRoute: typeof import("../app/api/history/route");
let productsRoute: typeof import("../app/api/products/route");
let productByIdRoute: typeof import("../app/api/products/[id]/route");
let categoriesRoute: typeof import("../app/api/products/categories/route");
let categoryByIdRoute: typeof import("../app/api/products/categories/[id]/route");

before(async () => {
  [
    sessionsRoute,
    sessionByIdRoute,
    sessionItemsRoute,
    sessionItemByIdRoute,
    sessionCloseRoute,
    historyRoute,
    productsRoute,
    productByIdRoute,
    categoriesRoute,
    categoryByIdRoute,
  ] = await Promise.all([
    import("../app/api/sessions/route"),
    import("../app/api/sessions/[id]/route"),
    import("../app/api/sessions/[id]/items/route"),
    import("../app/api/sessions/[id]/items/[itemId]/route"),
    import("../app/api/sessions/[id]/close/route"),
    import("../app/api/history/route"),
    import("../app/api/products/route"),
    import("../app/api/products/[id]/route"),
    import("../app/api/products/categories/route"),
    import("../app/api/products/categories/[id]/route"),
  ]);
});

after(() => {
  testDb.close();
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextReq(
  url: string,
  method: string,
  body?: unknown
): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string> | undefined) ??= {};
    (init as Record<string, unknown>).headers = { "content-type": "application/json" };
  }
  return new Request(url, init);
}

async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API /sessions", () => {
  it("full lifecycle: create → add items → close → verify bill", async () => {
    // 1. Create a snooker session (hourlyRate=10)
    const createReq = nextReq(
      "http://localhost/api/sessions",
      "POST",
      { area: "snooker", tableNumber: 1 }
    );
    const createRes = await sessionsRoute.POST(createReq as Parameters<typeof sessionsRoute.POST>[0]);
    assert.equal(createRes.status, 201);
    const session = await jsonBody(createRes);
    assert.ok(typeof session.id === "string");
    assert.equal(session.status, "open");
    assert.deepStrictEqual(session.items, []);
    const sessionId = session.id as string;

    // 2. Add items via POST /api/sessions/[id]/items
    const addCoffeeReq = nextReq(
      `http://localhost/api/sessions/${sessionId}/items`,
      "POST",
      { productId: "prod-coffee", qty: 2 }
    );
    const addCoffeeRes = await sessionItemsRoute.POST(
      addCoffeeReq as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );
    assert.equal(addCoffeeRes.status, 201);

    const addTeaReq = nextReq(
      `http://localhost/api/sessions/${sessionId}/items`,
      "POST",
      { productId: "prod-tea", qty: 1 }
    );
    const addTeaRes = await sessionItemsRoute.POST(
      addTeaReq as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );
    assert.equal(addTeaRes.status, 201);

    // 3. GET session and verify items persisted (regression guard)
    const getReq = new Request(`http://localhost/api/sessions/${sessionId}`);
    const getRes = await sessionByIdRoute.GET(getReq, { params: { id: sessionId } });
    assert.equal(getRes.status, 200);
    const fetched = await jsonBody(getRes);
    assert.equal(fetched.items.length, 2);
    const names = (fetched.items as Array<{ name: string; qty: number }>).map((i) => i.name);
    assert.ok(names.includes("Coffee"));
    assert.ok(names.includes("Tea"));

    // 4. Close session at a known time (90 min after open → 1.5h)
    const closedAt = new Date(new Date(session.openedAt as string).getTime() + 90 * 60_000);
    const closeReq = nextReq(
      `http://localhost/api/sessions/${sessionId}/close`,
      "POST",
      { closedAt: closedAt.toISOString() }
    );
    const closeRes = await sessionCloseRoute.POST(
      closeReq as Parameters<typeof sessionCloseRoute.POST>[0],
      { params: { id: sessionId } }
    );
    assert.equal(closeRes.status, 200);
    const closeBody = await jsonBody(closeRes);

    // 5. Assert bill matches manual calculation
    // productsTotal: 2 * 2.5 + 1 * 2 = 7
    // elapsedMinutes: 90 → timeCost: (90/60)*10 = 15
    // total: 7 + 15 = 22
    const bill = closeBody.bill as Record<string, number>;
    assert.equal(bill.productsTotal, 7);
    assert.equal(bill.elapsedMinutes, 90);
    assert.equal(bill.timeCost, 15);
    assert.equal(bill.total, 22);

    // Also verify that the closed session's billedTotal is set
    const closedSession = closeBody.session as Record<string, unknown>;
    assert.equal(closedSession.status, "closed");
    assert.equal(closedSession.billedTotal, 22);

    // 6. Verify session appears in history
    const histReq = new Request("http://localhost/api/history");
    const histRes = await historyRoute.GET(histReq);
    assert.equal(histRes.status, 200);
    const history = await jsonBody(histRes);
    assert.ok(Array.isArray(history));
    assert.equal(history.length, 1);
  });

  it("returns 400 for invalid area", async () => {
    const req = nextReq("http://localhost/api/sessions", "POST", {
      area: "invalid",
      tableNumber: 1,
    });
    const res = await sessionsRoute.POST(req as Parameters<typeof sessionsRoute.POST>[0]);
    assert.equal(res.status, 400);
  });

  it("GET /api/sessions lists open sessions only", async () => {
    // create a session then close another to verify filtering
    const openReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "cards",
      tableNumber: 10,
    });
    const openRes = await sessionsRoute.POST(openReq as Parameters<typeof sessionsRoute.POST>[0]);
    const openSession = await jsonBody(openRes);

    const closedReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "cards",
      tableNumber: 11,
    });
    const closedRes = await sessionsRoute.POST(closedReq as Parameters<typeof sessionsRoute.POST>[0]);
    const closedSession = await jsonBody(closedRes);

    // close the second one
    await sessionCloseRoute.POST(
      nextReq(`http://localhost/api/sessions/${closedSession.id}/close`, "POST") as Parameters<
        typeof sessionCloseRoute.POST
      >[0],
      { params: { id: closedSession.id as string } }
    );

    const listReq = new Request("http://localhost/api/sessions");
    const listRes = await sessionsRoute.GET();
    assert.equal(listRes.status, 200);
    const list = await jsonBody(listRes);
    assert.ok(Array.isArray(list));
    const ids = (list as Array<{ id: string }>).map((s) => s.id);
    assert.ok(ids.includes(openSession.id as string));
    assert.ok(!ids.includes(closedSession.id as string));
  });
});

describe("API /sessions/[id] PATCH", () => {
  it("bulk-syncs items and label via PATCH", async () => {
    // create session
    const createReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "playstation",
      tableNumber: 20,
    });
    const createRes = await sessionsRoute.POST(createReq as Parameters<typeof sessionsRoute.POST>[0]);
    const session = await jsonBody(createRes);
    const sessionId = session.id as string;

    // PATCH with items + label
    const patchReq = nextReq(`http://localhost/api/sessions/${sessionId}`, "PATCH", {
      label: "Ali's Group",
      items: [
        { productId: "prod-soda", name: "Soda", price: 2, qty: 3 },
        { productId: "prod-chips", name: "Chips", price: 1.5, qty: 1 },
      ],
    });
    const patchRes = await sessionByIdRoute.PATCH(
      patchReq as Parameters<typeof sessionByIdRoute.PATCH>[0],
      { params: { id: sessionId } }
    );
    assert.equal(patchRes.status, 200);
    const updated = await jsonBody(patchRes);
    assert.equal(updated.label, "Ali's Group");
    assert.equal((updated.items as unknown[]).length, 2);

    // Verify via GET
    const getReq = new Request(`http://localhost/api/sessions/${sessionId}`);
    const getRes = await sessionByIdRoute.GET(getReq, { params: { id: sessionId } });
    const fetched = await jsonBody(getRes);
    assert.equal(fetched.label, "Ali's Group");
    assert.equal((fetched.items as unknown[]).length, 2);
  });
});

describe("API /api/products", () => {
  it("GET returns categories and products", async () => {
    const req = new Request("http://localhost/api/products");
    const res = await productsRoute.GET();
    assert.equal(res.status, 200);
    const body = await jsonBody(res);
    assert.ok(Array.isArray(body.categories));
    assert.ok(Array.isArray(body.products));
    assert.ok((body.categories as unknown[]).length >= 3);
    assert.ok((body.products as unknown[]).length >= 9);
  });

  it("PATCH /api/products/[id] updates name and price", async () => {
    const patchReq = nextReq("http://localhost/api/products/prod-coffee", "PATCH", {
      name: "Espresso",
      price: 3.0,
    });
    const res = await productByIdRoute.PATCH(
      patchReq as Parameters<typeof productByIdRoute.PATCH>[0],
      { params: { id: "prod-coffee" } }
    );
    assert.equal(res.status, 200);
    const updated = await jsonBody(res);
    assert.equal(updated.name, "Espresso");
    assert.equal(updated.price, 3.0);
    assert.equal(updated.id, "prod-coffee");
  });

  it("DELETE /api/products/[id] returns 204", async () => {
    const req = new Request("http://localhost/api/products/prod-water", { method: "DELETE" });
    const res = await productByIdRoute.DELETE(
      req as Parameters<typeof productByIdRoute.DELETE>[0],
      { params: { id: "prod-water" } }
    );
    assert.equal(res.status, 204);
  });

  it("PATCH /api/products/[id] returns 404 for unknown product", async () => {
    const patchReq = nextReq("http://localhost/api/products/nonexistent", "PATCH", { name: "X" });
    const res = await productByIdRoute.PATCH(
      patchReq as Parameters<typeof productByIdRoute.PATCH>[0],
      { params: { id: "nonexistent" } }
    );
    assert.equal(res.status, 404);
  });
});

describe("API /api/products/categories", () => {
  it("POST creates a new category", async () => {
    const req = nextReq("http://localhost/api/products/categories", "POST", {
      name: "Desserts",
      order: 4,
    });
    const res = await categoriesRoute.POST(req as Parameters<typeof categoriesRoute.POST>[0]);
    assert.equal(res.status, 201);
    const category = await jsonBody(res);
    assert.equal(category.name, "Desserts");
    assert.equal(category.order, 4);
    assert.ok(typeof category.id === "string");
  });

  it("DELETE removes a category and returns 204", async () => {
    // first create one to delete
    const createReq = nextReq("http://localhost/api/products/categories", "POST", {
      name: "TempCat",
      order: 99,
    });
    const createRes = await categoriesRoute.POST(createReq as Parameters<typeof categoriesRoute.POST>[0]);
    const cat = await jsonBody(createRes);
    const catId = cat.id as string;

    const delReq = new Request(`http://localhost/api/products/categories/${catId}`, {
      method: "DELETE",
    });
    const delRes = await categoryByIdRoute.DELETE(
      delReq as Parameters<typeof categoryByIdRoute.DELETE>[0],
      { params: { id: catId } }
    );
    assert.equal(delRes.status, 204);
  });

  it("POST returns 400 when name is missing", async () => {
    const req = nextReq("http://localhost/api/products/categories", "POST", { order: 1 });
    const res = await categoriesRoute.POST(req as Parameters<typeof categoriesRoute.POST>[0]);
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------------
// Item CRUD: PATCH/DELETE /api/sessions/[id]/items/[itemId]
// ---------------------------------------------------------------------------

describe("API /sessions/[id]/items/[itemId]", () => {
  /**
   * SessionItem has no `id` field so the API never surfaces the internal
   * row id.  We grab it from the temp DB after adding an item so tests can
   * target the per-item endpoints.
   */
  async function createSessionWithItems(): Promise<{
    sessionId: string;
    coffeeItemId: string;
    teaItemId: string;
  }> {
    const createReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "snooker",
      tableNumber: 50,
    });
    const createRes = await sessionsRoute.POST(createReq as Parameters<typeof sessionsRoute.POST>[0]);
    const session = await jsonBody(createRes);
    const sessionId = session.id as string;

    // add two items
    await sessionItemsRoute.POST(
      nextReq(`http://localhost/api/sessions/${sessionId}/items`, "POST", {
        productId: "prod-coffee",
        qty: 2,
      }) as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );
    await sessionItemsRoute.POST(
      nextReq(`http://localhost/api/sessions/${sessionId}/items`, "POST", {
        productId: "prod-tea",
        qty: 1,
      }) as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );

    const rows = testDb
      .prepare("SELECT id, product_id FROM session_items WHERE session_id = ? ORDER BY rowid")
      .all(sessionId) as Array<{ id: string; product_id: string }>;

    const coffeeItemId = rows.find((r) => r.product_id === "prod-coffee")!.id;
    const teaItemId = rows.find((r) => r.product_id === "prod-tea")!.id;

    return { sessionId, coffeeItemId, teaItemId };
  }

  it("PATCH increases item qty", async () => {
    const { sessionId, coffeeItemId } = await createSessionWithItems();

    const req = nextReq(
      `http://localhost/api/sessions/${sessionId}/items/${coffeeItemId}`,
      "PATCH",
      { qty: 5 }
    );
    const res = await sessionItemByIdRoute.PATCH(
      req as Parameters<typeof sessionItemByIdRoute.PATCH>[0],
      { params: { id: sessionId, itemId: coffeeItemId } }
    );
    assert.equal(res.status, 200);
    const updated = await jsonBody(res);
    const coffee = (updated.items as Array<{ productId: string; qty: number }>).find(
      (i) => i.productId === "prod-coffee"
    );
    assert.ok(coffee);
    assert.equal(coffee.qty, 5);
  });

  it("PATCH decreases item qty", async () => {
    const { sessionId, teaItemId } = await createSessionWithItems();

    const req = nextReq(
      `http://localhost/api/sessions/${sessionId}/items/${teaItemId}`,
      "PATCH",
      { qty: 1 }
    );
    const res = await sessionItemByIdRoute.PATCH(
      req as Parameters<typeof sessionItemByIdRoute.PATCH>[0],
      { params: { id: sessionId, itemId: teaItemId } }
    );
    assert.equal(res.status, 200);
    const updated = await jsonBody(res);
    const tea = (updated.items as Array<{ productId: string; qty: number }>).find(
      (i) => i.productId === "prod-tea"
    );
    assert.ok(tea);
    assert.equal(tea.qty, 1);
  });

  it("PATCH with qty <= 0 removes the item entirely", async () => {
    const { sessionId, coffeeItemId } = await createSessionWithItems();

    const req = nextReq(
      `http://localhost/api/sessions/${sessionId}/items/${coffeeItemId}`,
      "PATCH",
      { qty: 0 }
    );
    const res = await sessionItemByIdRoute.PATCH(
      req as Parameters<typeof sessionItemByIdRoute.PATCH>[0],
      { params: { id: sessionId, itemId: coffeeItemId } }
    );
    assert.equal(res.status, 200);
    const updated = await jsonBody(res);
    const items = updated.items as Array<{ productId: string }>;
    assert.equal(items.length, 1); // only tea remains
    assert.equal(items[0].productId, "prod-tea");
  });

  it("DELETE removes exactly that item and leaves others untouched", async () => {
    const { sessionId, teaItemId } = await createSessionWithItems();

    const req = new Request(
      `http://localhost/api/sessions/${sessionId}/items/${teaItemId}`,
      { method: "DELETE" }
    );
    const res = await sessionItemByIdRoute.DELETE(
      req as Parameters<typeof sessionItemByIdRoute.DELETE>[0],
      { params: { id: sessionId, itemId: teaItemId } }
    );
    assert.equal(res.status, 200);
    const updated = await jsonBody(res);
    const items = updated.items as Array<{ productId: string; qty: number }>;
    assert.equal(items.length, 1); // only coffee remains
    assert.equal(items[0].productId, "prod-coffee");
    assert.equal(items[0].qty, 2);
  });
});

// ---------------------------------------------------------------------------
// Incremental item POST: merge behavior + bad productId
// ---------------------------------------------------------------------------

describe("API /sessions/[id]/items POST", () => {
  it("merges same productId into one line item with summed qty", async () => {
    const createReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "cards",
      tableNumber: 60,
    });
    const createRes = await sessionsRoute.POST(createReq as Parameters<typeof sessionsRoute.POST>[0]);
    const session = await jsonBody(createRes);
    const sessionId = session.id as string;

    // Post coffee qty 1, then coffee qty 1 again → should merge to qty=2
    const add1Req = nextReq(
      `http://localhost/api/sessions/${sessionId}/items`,
      "POST",
      { productId: "prod-coffee", qty: 1 }
    );
    await sessionItemsRoute.POST(
      add1Req as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );

    const add2Req = nextReq(
      `http://localhost/api/sessions/${sessionId}/items`,
      "POST",
      { productId: "prod-coffee", qty: 1 }
    );
    const add2Res = await sessionItemsRoute.POST(
      add2Req as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );
    assert.equal(add2Res.status, 201);
    const body = await jsonBody(add2Res);
    const items = body.items as Array<{ productId: string; qty: number }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].productId, "prod-coffee");
    assert.equal(items[0].qty, 2);
  });

  it("returns 400 for a productId not in the catalog", async () => {
    const createReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "cards",
      tableNumber: 61,
    });
    const createRes = await sessionsRoute.POST(createReq as Parameters<typeof sessionsRoute.POST>[0]);
    const session = await jsonBody(createRes);
    const sessionId = session.id as string;

    const req = nextReq(
      `http://localhost/api/sessions/${sessionId}/items`,
      "POST",
      { productId: "prod-nonexistent", qty: 1 }
    );
    const res = await sessionItemsRoute.POST(
      req as Parameters<typeof sessionItemsRoute.POST>[0],
      { params: { id: sessionId } }
    );
    assert.equal(res.status, 400);
    const body = await jsonBody(res);
    assert.ok(typeof body.error === "string");
  });
});

// ---------------------------------------------------------------------------
// Close guards
// ---------------------------------------------------------------------------

describe("API /sessions/[id]/close", () => {
  it("returns 400 when session is already closed", async () => {
    const createReq = nextReq("http://localhost/api/sessions", "POST", {
      area: "playstation",
      tableNumber: 70,
    });
    const createRes = await sessionsRoute.POST(createReq as Parameters<typeof sessionsRoute.POST>[0]);
    const session = await jsonBody(createRes);
    const sessionId = session.id as string;

    // Close it once
    await sessionCloseRoute.POST(
      nextReq(`http://localhost/api/sessions/${sessionId}/close`, "POST") as Parameters<
        typeof sessionCloseRoute.POST
      >[0],
      { params: { id: sessionId } }
    );

    // Try closing again
    const closeReq = nextReq(
      `http://localhost/api/sessions/${sessionId}/close`,
      "POST"
    );
    const res = await sessionCloseRoute.POST(
      closeReq as Parameters<typeof sessionCloseRoute.POST>[0],
      { params: { id: sessionId } }
    );
    assert.equal(res.status, 400);
    const body = await jsonBody(res);
    assert.equal(body.error, "Session already closed");
  });
});

// ---------------------------------------------------------------------------
// History with query params
// ---------------------------------------------------------------------------

describe("API /history filters", () => {
  it("?area= filters to the right area when multiple areas are closed", async () => {
    // Create and close a snooker session at a known time
    const snookerRes = await sessionsRoute.POST(
      nextReq("http://localhost/api/sessions", "POST", {
        area: "snooker",
        tableNumber: 80,
      }) as Parameters<typeof sessionsRoute.POST>[0]
    );
    const snookerSession = await jsonBody(snookerRes);
    const snookerId = snookerSession.id as string;
    const snookerOpenTime = new Date(snookerSession.openedAt as string);
    const snookerClosedAt = new Date(snookerOpenTime.getTime() + 30 * 60_000); // +30 min

    await sessionCloseRoute.POST(
      nextReq(`http://localhost/api/sessions/${snookerId}/close`, "POST", {
        closedAt: snookerClosedAt.toISOString(),
      }) as Parameters<typeof sessionCloseRoute.POST>[0],
      { params: { id: snookerId } }
    );

    // Create and close a cards session at a different time
    const cardsRes = await sessionsRoute.POST(
      nextReq("http://localhost/api/sessions", "POST", {
        area: "cards",
        tableNumber: 81,
      }) as Parameters<typeof sessionsRoute.POST>[0]
    );
    const cardsSession = await jsonBody(cardsRes);
    const cardsId = cardsSession.id as string;
    const cardsOpenTime = new Date(cardsSession.openedAt as string);
    const cardsClosedAt = new Date(cardsOpenTime.getTime() + 60 * 60_000); // +60 min

    await sessionCloseRoute.POST(
      nextReq(`http://localhost/api/sessions/${cardsId}/close`, "POST", {
        closedAt: cardsClosedAt.toISOString(),
      }) as Parameters<typeof sessionCloseRoute.POST>[0],
      { params: { id: cardsId } }
    );

    // Filter by area=snooker
    const areaReq = new Request("http://localhost/api/history?area=snooker");
    const areaRes = await historyRoute.GET(areaReq as Parameters<typeof historyRoute.GET>[0]);
    assert.equal(areaRes.status, 200);
    const areaHistory = await jsonBody(areaRes);
    assert.ok(Array.isArray(areaHistory));
    const areaIds = (areaHistory as Array<{ id: string }>).map((s) => s.id);
    assert.ok(areaIds.includes(snookerId));
    assert.ok(!areaIds.includes(cardsId));
    // All returned sessions must be snooker area
    for (const s of areaHistory as Array<{ area: string }>) assert.equal(s.area, "snooker");

    // Filter by area=cards
    const cardsReq = new Request("http://localhost/api/history?area=cards");
    const cardsHistRes = await historyRoute.GET(cardsReq as Parameters<typeof historyRoute.GET>[0]);
    const cardsHistory = await jsonBody(cardsHistRes);
    assert.ok(Array.isArray(cardsHistory));
    const cardsIds = (cardsHistory as Array<{ id: string }>).map((s) => s.id);
    assert.ok(cardsIds.includes(cardsId));
    assert.ok(!cardsIds.includes(snookerId));

    // ?from=...&to=... bounding: cards was closed at cardsClosedAt which is
    // later than snookerClosedAt.  Query from=before snooker to=after snooker
    // but before cards → only snooker should appear.
    const fromStr = new Date(snookerClosedAt.getTime() - 1 * 60_000).toISOString();
    const toStr = new Date(cardsClosedAt.getTime() - 1 * 60_000).toISOString();
    const rangeReq = new Request(
      `http://localhost/api/history?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`
    );
    const rangeRes = await historyRoute.GET(rangeReq as Parameters<typeof historyRoute.GET>[0]);
    const rangeHistory = await jsonBody(rangeRes);
    assert.ok(Array.isArray(rangeHistory));
    const rangeIds = (rangeHistory as Array<{ id: string }>).map((s) => s.id);
    assert.ok(rangeIds.includes(snookerId));
    assert.ok(!rangeIds.includes(cardsId));
  });
});
