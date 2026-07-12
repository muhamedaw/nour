/**
 * Seed fake session history for testing the logs / dashboard pages.
 *
 * Usage:
 *   npx tsx scripts/seed-fake-history.ts
 *
 * Run this while the dev server is NOT running (it opens the same DB file).
 * Then start the dev server and navigate to /history or /dashboard/report.
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data");
const DB_PATH = path.join(DATA_DIR, "floor.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Open / create the database with full schema
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);
db.pragma("busy_timeout = 5000");
db.pragma("journal_mode = WAL");

db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`);

// Seed products + categories if empty
const catCount = (db.prepare("SELECT COUNT(*) AS c FROM categories").get() as { c: number }).c;
if (catCount === 0) {
  db.prepare("INSERT INTO categories (id, name, order_index) VALUES (?, ?, ?)").run("cat-drinks", "Drinks", 1);
  db.prepare("INSERT INTO categories (id, name, order_index) VALUES (?, ?, ?)").run("cat-snacks", "Snacks", 2);
  db.prepare("INSERT INTO categories (id, name, order_index) VALUES (?, ?, ?)").run("cat-extras", "Extras", 3);

  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-coffee", "cat-drinks", "Coffee", 2.5);
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-tea", "cat-drinks", "Tea", 2);
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-water", "cat-drinks", "Water", 1);
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-soda", "cat-drinks", "Soda", 2);
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-chips", "cat-snacks", "Chips", 1.5);
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-sandwich", "cat-snacks", "Sandwich", 4);
  db.prepare("INSERT INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)").run("prod-shisha", "cat-extras", "Shisha", 6);
}

const areaCount = (db.prepare("SELECT COUNT(*) AS c FROM area_settings").get() as { c: number }).c;
if (areaCount === 0) {
  db.prepare("INSERT INTO area_settings (area, label, table_count, hourly_rate) VALUES (?, ?, ?, ?)").run("snooker", "Snooker", 15, 10);
  db.prepare("INSERT INTO area_settings (area, label, table_count, hourly_rate) VALUES (?, ?, ?, ?)").run("cards", "Cards", 6, null);
  db.prepare("INSERT INTO area_settings (area, label, table_count, hourly_rate) VALUES (?, ?, ?, ?)").run("playstation", "PlayStation", 4, 8);
}

// ---------------------------------------------------------------------------
// Seed fake session history — 8 days, 3–6 sessions per day
// ---------------------------------------------------------------------------

const insertSession = db.prepare(
  "INSERT OR IGNORE INTO sessions (id, area, table_number, label, opened_at, closed_at, status, billed_total) VALUES (?, ?, ?, ?, ?, ?, 'closed', ?)"
);
const insertItem = db.prepare(
  "INSERT OR IGNORE INTO session_items (id, session_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)"
);

const areas = ["snooker", "playstation", "cards"] as const;
const hourlyRates: Record<string, number | null> = { snooker: 10, playstation: 8, cards: null };
const drinkProds = [
  { pid: "prod-coffee", name: "قهوة", price: 2.5 },
  { pid: "prod-tea", name: "شاي", price: 2 },
  { pid: "prod-water", name: "ماء", price: 1 },
  { pid: "prod-soda", name: "بيبسي", price: 2 },
];
const foodProds = [
  { pid: "prod-chips", name: "شبس", price: 1.5 },
  { pid: "prod-sandwich", name: "ساندويتش", price: 4 },
];
const extraProds = [{ pid: "prod-shisha", name: "شيشة", price: 6 }];
const allProds = [...drinkProds, ...foodProds, ...extraProds];

const now = new Date();
let seededCount = 0;

const seed = db.transaction(() => {
  for (let day = 8; day >= 0; day--) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    date.setHours(0, 0, 0, 0);

    const sessionsToday = 2 + Math.floor(Math.random() * 5); // 2–6

    for (let s = 0; s < sessionsToday; s++) {
      const area = areas[Math.floor(Math.random() * areas.length)];
      const tableNum = 1 + Math.floor(Math.random() * 12);
      const customerLabel = Math.random() > 0.3
        ? ["أحمد", "محمد", "سامي", "خالد", "فهد", "نورة", "سارة", "ماجد", "ياسر", "طلال"][Math.floor(Math.random() * 10)]
        : null;

      // Opened between 9 AM and 10 PM
      const openedAt = new Date(date);
      openedAt.setHours(9 + Math.floor(Math.random() * 13));
      openedAt.setMinutes(Math.floor(Math.random() * 60));

      // Duration: 20 min to 3 hours
      const durationMin = 20 + Math.floor(Math.random() * 160);
      const closedAt = new Date(openedAt.getTime() + durationMin * 60_000);

      // Pick 1–4 random items
      const itemCount = 1 + Math.floor(Math.random() * 4);
      const chosen = new Set<number>();
      const sessionItems: Array<{ pid: string; name: string; price: number; qty: number }> = [];
      for (let i = 0; i < itemCount; i++) {
        const idx = Math.floor(Math.random() * allProds.length);
        if (chosen.has(idx)) continue;
        chosen.add(idx);
        const prod = allProds[idx];
        sessionItems.push({ ...prod, qty: 1 + Math.floor(Math.random() * 3) });
      }

      // Compute time cost
      const rate = hourlyRates[area];
      let timeCost = 0;
      if (rate !== null) {
        const elapsedMin = Math.round((closedAt.getTime() - openedAt.getTime()) / 60000);
        timeCost = (elapsedMin / 60) * rate;
      }

      const prodTotal = sessionItems.reduce((sum, i) => sum + i.price * i.qty, 0);
      const total = Math.round((prodTotal + timeCost) * 100) / 100;

      const sessionId = `seed-${day}-${s}-${Math.random().toString(36).slice(2, 6)}`;

      insertSession.run(
        sessionId,
        area,
        tableNum,
        customerLabel,
        openedAt.toISOString(),
        closedAt.toISOString(),
        total
      );

      for (const item of sessionItems) {
        const itemId = `si-${sessionId}-${item.pid}`;
        insertItem.run(itemId, sessionId, item.pid, item.name, item.price, item.qty);
      }

      seededCount++;
    }
  }
});

seed();

console.log(`Seeded ${seededCount} fake closed sessions into ${DB_PATH}`);
console.log("Now stop the dev server, start it again, and navigate to /history");

db.close();
