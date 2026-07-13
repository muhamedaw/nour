/**
 * Local database layer — offline replacement for the server-side SQLite
 * connection in lib/db.ts. Same tables, same validation rules, same error
 * conditions, same function signatures — just running against sql.js
 * (WASM SQLite, persisted to IndexedDB) instead of better-sqlite3 against
 * a file on a server's disk. See ./db.ts for why sql.js over wa-sqlite.
 *
 * Every function here is synchronous — call `initLocalDb()` (from ./db)
 * once at app start and await it before using anything in this module.
 */
import type { AreaConfig, AreaType, Category, GroupSession, Product, SessionItem } from "../types";
import { exec, getDb, initLocalDb, queryAll, queryOne, replaceDatabase, transaction } from "./db";
import { encryptBackup, decryptBackup } from "./encryption";

export { initLocalDb, flushPersist, __setDbForTesting, runMigrations } from "./db";

/** Whole-DB snapshot for the backup/restore flow (components/settings/BackupRestore.tsx). */
export async function exportDatabaseSnapshot(): Promise<Blob> {
  await initLocalDb();
  const bytes = getDb().export();
  return new Blob([bytes as BlobPart], { type: "application/octet-stream" });
}

/** Destructive: wholesale-replaces the live DB with an imported snapshot. */
export async function importDatabaseSnapshot(file: Blob): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await replaceDatabase(bytes);
}

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
  players_json: string | null;
  time_adjustment_seconds: number;
  split_snapshot_json: string | null;
}

interface SessionItemRow {
  id: string;
  session_id: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
  assigned_player: string | null;
}

interface ProductRow {
  id: string;
  category_id: string;
  name: string;
  price: number;
  image_data_url: string | null;
  highlight_flag: number;
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
    players: row.players_json ? (JSON.parse(row.players_json) as string[]) : undefined,
    timeAdjustmentSeconds: row.time_adjustment_seconds ?? 0,
    splitSnapshot: row.split_snapshot_json
      ? (JSON.parse(row.split_snapshot_json) as GroupSession["splitSnapshot"])
      : undefined,
  };
}

function rowToSessionItem(row: SessionItemRow): SessionItem {
  return {
    productId: row.product_id,
    name: row.name,
    price: row.price,
    qty: row.qty,
    assignedPlayer: row.assigned_player ?? undefined,
  };
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: row.price,
    imageDataUrl: row.image_data_url ?? undefined,
    highlightFlag: !!row.highlight_flag,
  };
}

function rowToCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, order: row.order_index };
}

function rowToAreaSettings(row: AreaSettingsRow): AreaConfig {
  return { area: row.area, label: row.label, tableCount: row.table_count, hourlyRate: row.hourly_rate };
}

function getItemsForSession(sessionId: string): SessionItemRow[] {
  return queryAll<SessionItemRow>("SELECT * FROM session_items WHERE session_id = ? ORDER BY rowid", [
    sessionId,
  ]);
}

// ---- sessions ----

export function listOpenSessions(): GroupSession[] {
  const rows = queryAll<SessionRow>("SELECT * FROM sessions WHERE status = 'open'");
  return rows.map((r) => rowToSession(r, getItemsForSession(r.id)));
}

export function findOpenSessionForTable(area: AreaType, tableNumber: number): GroupSession | null {
  const row = queryOne<SessionRow>(
    "SELECT * FROM sessions WHERE area = ? AND table_number = ? AND status = 'open'",
    [area, tableNumber]
  );
  if (!row) return null;
  return rowToSession(row, getItemsForSession(row.id));
}

export function createSession(area: AreaType, tableNumber: number): GroupSession {
  const existing = findOpenSessionForTable(area, tableNumber);
  if (existing) return existing;
  const id = crypto.randomUUID();
  const openedAt = new Date().toISOString();
  exec(
    "INSERT INTO sessions (id, area, table_number, label, opened_at, closed_at, status, billed_total) VALUES (?, ?, ?, NULL, ?, NULL, 'open', NULL)",
    [id, area, tableNumber, openedAt]
  );
  return { id, area, tableNumber, openedAt, status: "open", items: [] };
}

export function getSessionById(id: string): GroupSession | null {
  const row = queryOne<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
  if (!row) return null;
  return rowToSession(row, getItemsForSession(row.id));
}

export function addSessionItem(sessionId: string, productId: string, qty: number): GroupSession | null {
  const session = getSessionById(sessionId);
  if (!session) return null;
  const product = queryOne<ProductRow>("SELECT * FROM products WHERE id = ?", [productId]);
  if (!product) throw new Error(`No product found for id: ${productId}`);

  const existing = queryOne<SessionItemRow>(
    "SELECT * FROM session_items WHERE session_id = ? AND product_id = ?",
    [sessionId, productId]
  );

  if (existing) {
    exec("UPDATE session_items SET qty = qty + ? WHERE id = ?", [qty, existing.id]);
  } else {
    exec(
      "INSERT INTO session_items (id, session_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), sessionId, productId, product.name, product.price, qty]
    );
  }
  return getSessionById(sessionId);
}

export function updateSessionItemQty(sessionId: string, itemId: string, qty: number): GroupSession | null {
  if (qty <= 0) {
    exec("DELETE FROM session_items WHERE id = ? AND session_id = ?", [itemId, sessionId]);
  } else {
    exec("UPDATE session_items SET qty = ? WHERE id = ? AND session_id = ?", [qty, itemId, sessionId]);
  }
  return getSessionById(sessionId);
}

export function deleteSessionItem(sessionId: string, itemId: string): GroupSession | null {
  exec("DELETE FROM session_items WHERE id = ? AND session_id = ?", [itemId, sessionId]);
  return getSessionById(sessionId);
}

export function replaceSessionItemsAndLabel(
  sessionId: string,
  items?: SessionItem[],
  label?: string,
  players?: string[],
  timeAdjustmentSeconds?: number
): GroupSession | null {
  const session = getSessionById(sessionId);
  if (!session) return null;

  transaction(() => {
    if (items) {
      exec("DELETE FROM session_items WHERE session_id = ?", [sessionId]);
      for (const item of items) {
        exec(
          "INSERT INTO session_items (id, session_id, product_id, name, price, qty, assigned_player) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            sessionId,
            item.productId,
            item.name,
            item.price,
            item.qty,
            item.assignedPlayer ?? null,
          ]
        );
      }
    }
    if (label !== undefined) {
      exec("UPDATE sessions SET label = ? WHERE id = ?", [label, sessionId]);
    }
    if (players !== undefined) {
      exec("UPDATE sessions SET players_json = ? WHERE id = ?", [JSON.stringify(players), sessionId]);
    }
    if (timeAdjustmentSeconds !== undefined) {
      exec("UPDATE sessions SET time_adjustment_seconds = ? WHERE id = ?", [
        timeAdjustmentSeconds,
        sessionId,
      ]);
    }
  });

  return getSessionById(sessionId);
}

export function closeSession(
  sessionId: string,
  closedAt: string,
  billedTotal: number,
  splitSnapshot?: GroupSession["splitSnapshot"]
): GroupSession | null {
  if (splitSnapshot !== undefined) {
    exec(
      "UPDATE sessions SET status = 'closed', closed_at = ?, billed_total = ?, split_snapshot_json = ? WHERE id = ?",
      [closedAt, billedTotal, JSON.stringify(splitSnapshot), sessionId]
    );
  } else {
    exec("UPDATE sessions SET status = 'closed', closed_at = ?, billed_total = ? WHERE id = ?", [
      closedAt,
      billedTotal,
      sessionId,
    ]);
  }
  return getSessionById(sessionId);
}

/** Moves an OPEN session to a different table number within its own area. */
export function transferSession(sessionId: string, newTableNumber: number): GroupSession {
  transaction(() => {
    const session = getSessionById(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "open") throw new Error("Cannot transfer a closed session");

    const clash = queryOne<{ id: string }>(
      "SELECT id FROM sessions WHERE area = ? AND table_number = ? AND status = 'open' AND id != ?",
      [session.area, newTableNumber, sessionId]
    );
    if (clash) throw new Error(`Table ${newTableNumber} already has an open session`);

    exec("UPDATE sessions SET table_number = ? WHERE id = ?", [newTableNumber, sessionId]);
  });
  return getSessionById(sessionId) as GroupSession;
}

/**
 * Merges `fromSessionId`'s items into `intoSessionId` (same qty-merge rule
 * as `addSessionItem`), then closes `fromSessionId` with billedTotal=0 and
 * `merged_into` pointing at the target session.
 */
export function mergeSessions(intoSessionId: string, fromSessionId: string): GroupSession {
  if (intoSessionId === fromSessionId) throw new Error("Cannot merge a session into itself");

  transaction(() => {
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
      const existing = queryOne<SessionItemRow>(
        "SELECT * FROM session_items WHERE session_id = ? AND product_id = ?",
        [intoSessionId, item.productId]
      );
      if (existing) {
        exec("UPDATE session_items SET qty = qty + ? WHERE id = ?", [item.qty, existing.id]);
      } else {
        exec(
          "INSERT INTO session_items (id, session_id, product_id, name, price, qty, assigned_player) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            intoSessionId,
            item.productId,
            item.name,
            item.price,
            item.qty,
            item.assignedPlayer ?? null,
          ]
        );
      }
    }
    exec("DELETE FROM session_items WHERE session_id = ?", [fromSessionId]);
    exec(
      "UPDATE sessions SET status = 'closed', closed_at = ?, billed_total = 0, merged_into = ? WHERE id = ?",
      [new Date().toISOString(), intoSessionId, fromSessionId]
    );
  });

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
  // `rowid DESC` tiebreaker — see lib/db.ts's identical comment: closed_at
  // has millisecond precision and same-millisecond closes are common with
  // synchronous in-process SQLite, so ordering needs a stable secondary key.
  const rows = queryAll<SessionRow>(
    `SELECT * FROM sessions WHERE ${clauses.join(" AND ")} ORDER BY closed_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows.map((r) => rowToSession(r, getItemsForSession(r.id)));
}

/** Total matching rows for `filter`, ignoring limit/offset — pairs with listHistory() for pagination. */
export function countHistory(filter: Omit<HistoryFilter, "limit" | "offset">): number {
  const { clauses, params } = buildHistoryClauses(filter);
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM sessions WHERE ${clauses.join(" AND ")}`,
    params
  );
  return row?.count ?? 0;
}

// ---- catalog ----

export function listCategories(): Category[] {
  const rows = queryAll<CategoryRow>("SELECT * FROM categories ORDER BY order_index");
  return rows.map(rowToCategory);
}

export function listProducts(): Product[] {
  const rows = queryAll<ProductRow>("SELECT * FROM products ORDER BY rowid");
  return rows.map(rowToProduct);
}

export function createProduct(
  categoryId: string,
  name: string,
  price: number,
  options: { imageDataUrl?: string | null; highlightFlag?: boolean } = {}
): Product {
  const id = crypto.randomUUID();
  const imageDataUrl = options.imageDataUrl ?? null;
  const highlightFlag = options.highlightFlag ? 1 : 0;
  exec(
    "INSERT INTO products (id, category_id, name, price, image_data_url, highlight_flag) VALUES (?, ?, ?, ?, ?, ?)",
    [id, categoryId, name, price, imageDataUrl, highlightFlag]
  );
  return {
    id,
    categoryId,
    name,
    price,
    imageDataUrl: imageDataUrl ?? undefined,
    highlightFlag: !!highlightFlag,
  };
}

export function updateProduct(
  id: string,
  fields: {
    name?: string;
    price?: number;
    categoryId?: string;
    imageDataUrl?: string | null;
    highlightFlag?: boolean;
  }
): Product | null {
  const row = queryOne<ProductRow>("SELECT * FROM products WHERE id = ?", [id]);
  if (!row) return null;
  const name = fields.name ?? row.name;
  const price = fields.price ?? row.price;
  const categoryId = fields.categoryId ?? row.category_id;
  const imageDataUrl = fields.imageDataUrl !== undefined ? fields.imageDataUrl : row.image_data_url;
  const highlightFlag =
    fields.highlightFlag !== undefined ? (fields.highlightFlag ? 1 : 0) : row.highlight_flag;
  exec(
    "UPDATE products SET name = ?, price = ?, category_id = ?, image_data_url = ?, highlight_flag = ? WHERE id = ?",
    [name, price, categoryId, imageDataUrl, highlightFlag, id]
  );
  return {
    id,
    categoryId,
    name,
    price,
    imageDataUrl: imageDataUrl ?? undefined,
    highlightFlag: !!highlightFlag,
  };
}

export function deleteProduct(id: string): void {
  exec("DELETE FROM products WHERE id = ?", [id]);
}

export function createCategory(name: string, order: number): Category {
  const id = crypto.randomUUID();
  exec("INSERT INTO categories (id, name, order_index) VALUES (?, ?, ?)", [id, name, order]);
  return { id, name, order };
}

export function deleteCategory(id: string): void {
  exec("DELETE FROM categories WHERE id = ?", [id]);
}

// ---- area settings ----
// DB-backed, editable replacement for the hardcoded lib/config.ts#AREA_CONFIG
// constant (which remains only as seed data for first-run insertion).

export function getAreaSettings(area: AreaType): AreaConfig {
  const row = queryOne<AreaSettingsRow>("SELECT * FROM area_settings WHERE area = ?", [area]);
  if (!row) throw new Error(`No area settings found for area: ${area}`);
  return rowToAreaSettings(row);
}

export function listAreaSettings(): AreaConfig[] {
  const rows = queryAll<AreaSettingsRow>("SELECT * FROM area_settings ORDER BY rowid");
  return rows.map(rowToAreaSettings);
}

export function updateAreaSettings(
  area: AreaType,
  fields: { tableCount?: number; hourlyRate?: number | null; label?: string }
): AreaConfig {
  transaction(() => {
    const current = getAreaSettings(area);

    if (fields.tableCount !== undefined && fields.tableCount < current.tableCount) {
      const openAbove = queryOne<{ maxTable: number | null }>(
        "SELECT MAX(table_number) as maxTable FROM sessions WHERE area = ? AND status = 'open' AND table_number > ?",
        [area, fields.tableCount]
      );
      if (openAbove && openAbove.maxTable !== null) {
        throw new Error(
          `Cannot reduce table count to ${fields.tableCount}: table ${openAbove.maxTable} has an open session`
        );
      }
    }

    const label = fields.label ?? current.label;
    const tableCount = fields.tableCount ?? current.tableCount;
    const hourlyRate = fields.hourlyRate !== undefined ? fields.hourlyRate : current.hourlyRate;

    exec("UPDATE area_settings SET label = ?, table_count = ?, hourly_rate = ? WHERE area = ?", [
      label,
      tableCount,
      hourlyRate,
      area,
    ]);
  });

  return getAreaSettings(area);
}

// ---- staff password (offline auth) ----
// Replaces the old server-side STAFF_PASSWORD env var + cookie session:
// a SHA-256 hash lives in app_meta (seeded once, changeable later from a
// settings screen), checked against a plain-text candidate at app start.
// These are the only async exports in this module — Web Crypto's digest()
// has no synchronous form.

const PASSWORD_HASH_KEY = "staff_password_hash";
const DEFAULT_STAFF_PASSWORD = "1234";

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Seeds a default password hash on first run — no-op if one already exists. */
export async function ensureStaffPasswordSeeded(): Promise<void> {
  const existing = queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [
    PASSWORD_HASH_KEY,
  ]);
  if (existing) return;
  const hash = await sha256Hex(DEFAULT_STAFF_PASSWORD);
  exec("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)", [PASSWORD_HASH_KEY, hash]);
}

export async function checkStaffPassword(candidate: string): Promise<boolean> {
  const row = queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [
    PASSWORD_HASH_KEY,
  ]);
  if (!row) return false;
  const hash = await sha256Hex(candidate);
  return hash === row.value;
}

export async function setStaffPassword(newPassword: string): Promise<void> {
  const hash = await sha256Hex(newPassword);
  const existing = queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [
    PASSWORD_HASH_KEY,
  ]);
  if (existing) {
    exec("UPDATE app_meta SET value = ? WHERE key = ?", [hash, PASSWORD_HASH_KEY]);
  } else {
    exec("INSERT INTO app_meta (key, value) VALUES (?, ?)", [PASSWORD_HASH_KEY, hash]);
  }
}

// ---- password-protected auto-backup ----
// Every session close triggers an encrypted whole-DB snapshot stored in
// localStorage (survives reinstall via Android Auto Backup).  When the
// app starts with an empty database and the user enters their password,
// the backup is silently decrypted and restored — "enter password, get
// all data back".
//
// The backup format in localStorage is a JSON object:
//   { version: 1, createdAt: "ISO date", blob: "<base64 encrypted data>" }

const BACKUP_LOCALSTORAGE_KEY = "taraf_encrypted_backup";

// In-memory (NOT persisted) — stores the plaintext password after login so
// closeSession can trigger an encrypted backup without the UI thread having
// to thread the password through every component.
let _currentPassword: string | null = null;

export function setCurrentStaffPassword(password: string | null): void {
  _currentPassword = password;
}

export function getCurrentStaffPassword(): string | null {
  return _currentPassword;
}

interface BackupEnvelope {
  version: 1;
  createdAt: string;
  blob: string; // base64-encoded encrypted Uint8Array
}

/** Export the full DB snapshot, encrypt with password, save to localStorage. */
export async function saveEncryptedBackup(password: string): Promise<void> {
  const bytes = getDb().export();
  const encrypted = await encryptBackup(password, bytes);
  const envelope: BackupEnvelope = {
    version: 1,
    createdAt: new Date().toISOString(),
    blob: uint8ArrayToBase64(encrypted),
  };
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BACKUP_LOCALSTORAGE_KEY, JSON.stringify(envelope));
    }
  } catch {
    // localStorage may be full or unavailable — silently skip
  }
}

/** Check if a backup exists in localStorage. */
export function hasEncryptedBackup(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BACKUP_LOCALSTORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Try to decrypt and restore the stored backup with the given password.  Returns true on success. */
export async function tryRestoreFromBackup(password: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(BACKUP_LOCALSTORAGE_KEY);
    if (!raw) return false;

    const envelope: BackupEnvelope = JSON.parse(raw);
    const encrypted = base64ToUint8Array(envelope.blob);
    const plaintext = await decryptBackup(password, encrypted);
    if (!plaintext) return false; // wrong password or corrupted

    await replaceDatabase(plaintext);
    return true;
  } catch {
    return false;
  }
}

/** Check whether the session table is empty (used to decide if restore is needed). */
export function isDatabaseEmpty(): boolean {
  const row = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM sessions");
  return !row || row.c === 0;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa !== "undefined") return btoa(binary);
  // fallback for older environments (shouldn't hit in practice)
  return Buffer.from(binary, "binary").toString("base64");
}

function base64ToUint8Array(base64: string): Uint8Array {
  let binary: string;
  if (typeof atob !== "undefined") {
    binary = atob(base64);
  } else {
    binary = Buffer.from(base64, "base64").toString("binary");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
