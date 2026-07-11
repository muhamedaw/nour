import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../lib/config";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "floor.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
`);

const insertCategory = db.prepare(
  "INSERT OR REPLACE INTO categories (id, name, order_index) VALUES (?, ?, ?)"
);
const insertProduct = db.prepare(
  "INSERT OR REPLACE INTO products (id, category_id, name, price) VALUES (?, ?, ?, ?)"
);

const seed = db.transaction(() => {
  for (const c of SEED_CATEGORIES) {
    insertCategory.run(c.id, c.name, c.order);
  }
  for (const p of SEED_PRODUCTS) {
    insertProduct.run(p.id, p.categoryId, p.name, p.price);
  }
});
seed();

console.log(
  `Seeded ${SEED_CATEGORIES.length} categories and ${SEED_PRODUCTS.length} products into ${DB_PATH}`
);

db.close();
