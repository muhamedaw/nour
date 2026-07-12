"use client";

import type {
  AreaConfig,
  AreaType,
  Category,
  GroupSession,
  Product,
  SessionItem,
} from "@/lib/types";
import * as localdb from "@/lib/localdb";
import { initLocalDb } from "@/lib/localdb";

/**
 * Local data client — same exported function names/signatures as the old
 * server-`fetch()`-based client, so every UI component that imports from
 * here needed zero changes. Internals now call straight into lib/localdb/
 * (sql.js + IndexedDB, synchronous once initLocalDb() resolves) instead of
 * hitting a server that no longer exists — this is a fully offline app now.
 *
 * Error-shape conventions carried over unchanged:
 *   • Functions that only ever succeeded/failed opaquely over the old API
 *     (fetch*, create*, etc.) keep the `T | null` shape — `null` on any
 *     thrown error, logged via console.warn.
 *   • Functions that used to surface a server 400 (transfer / merge /
 *     patch-area) keep the `{ ok: false, status, message }` shape — the
 *     thrown Error's message becomes `message` so the UI's inline error
 *     banners work unchanged.
 */

async function ready(): Promise<void> {
  await initLocalDb();
}

/* ----------------------------- Sessions ----------------------------- */

export interface FetchSessionsArgs {
  area?: AreaType;
  status?: "open" | "closed";
}

export async function fetchSessions(
  args: FetchSessionsArgs = {},
): Promise<GroupSession[] | null> {
  try {
    await ready();
    if (args.status === "closed") {
      return localdb.listHistory({ area: args.area });
    }
    const open = localdb.listOpenSessions();
    return args.area ? open.filter((s) => s.area === args.area) : open;
  } catch (err) {
    console.warn("[localdb] fetchSessions failed", err);
    return null;
  }
}

export async function openSessionRemote(
  area: AreaType,
  tableNumber: number,
  label?: string,
): Promise<GroupSession | null> {
  try {
    await ready();
    const session = localdb.createSession(area, tableNumber);
    if (label !== undefined && label !== session.label) {
      return localdb.replaceSessionItemsAndLabel(session.id, undefined, label);
    }
    return session;
  } catch (err) {
    console.warn("[localdb] openSessionRemote failed", err);
    return null;
  }
}

export interface PatchSessionInput {
  items?: SessionItem[];
  label?: string;
}

export async function patchSessionRemote(
  id: string,
  patch: PatchSessionInput,
): Promise<GroupSession | null> {
  try {
    await ready();
    return localdb.replaceSessionItemsAndLabel(id, patch.items, patch.label);
  } catch (err) {
    console.warn("[localdb] patchSessionRemote failed", err);
    return null;
  }
}

export interface CloseSessionInput {
  items: SessionItem[];
  billedTotal: number;
  closedAt: string;
}

export async function closeSessionRemote(
  id: string,
  payload: CloseSessionInput,
): Promise<GroupSession | null> {
  try {
    await ready();
    // Sync whatever items the UI has right before closing — covers the
    // edge case where the last item change hadn't been persisted yet.
    localdb.replaceSessionItemsAndLabel(id, payload.items);
    const result = localdb.closeSession(id, payload.closedAt, payload.billedTotal);

    // Auto-backup: after every close, encrypt a full DB snapshot with the
    // staff password and store it in localStorage.  On fresh install, the
    // same password unlocks the backup and restores all data.
    if (result) {
      const currentPassword = localdb.getCurrentStaffPassword();
      if (currentPassword) {
        localdb.saveEncryptedBackup(currentPassword).catch(() => {});
      }
    }

    return result;
  } catch (err) {
    console.warn("[localdb] closeSessionRemote failed", err);
    return null;
  }
}

/**
 * Transfer a session to a different (free) table inside the same area.
 * Mirrors the old 400-from-server shape: `transferSession()` throws with a
 * human-readable message when the target table is occupied, and that
 * message is surfaced inline in the modal same as before.
 */
export interface TransferOk {
  ok: true;
  session: GroupSession;
}
export interface TransferFail {
  ok: false;
  status: number;
  message: string;
}
export async function transferSessionRemote(
  id: string,
  tableNumber: number,
): Promise<TransferOk | TransferFail> {
  try {
    await ready();
    const session = localdb.transferSession(id, tableNumber);
    return { ok: true, session };
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذّر نقل الجلسة.";
    console.warn("[localdb] transferSessionRemote failed", err);
    return { ok: false, status: 400, message };
  }
}

/**
 * Merge another open session's items into this one. The other session
 * gets closed locally with billedTotal=0; this call returns the absorbing
 * session (with merged items).
 */
export interface MergeOk {
  ok: true;
  session: GroupSession;
}
export interface MergeFail {
  ok: false;
  status: number;
  message: string;
}
export async function mergeSessionRemote(
  id: string,
  fromSessionId: string,
): Promise<MergeOk | MergeFail> {
  try {
    await ready();
    const session = localdb.mergeSessions(id, fromSessionId);
    return { ok: true, session };
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذّر دمج الجلسة.";
    console.warn("[localdb] mergeSessionRemote failed", err);
    return { ok: false, status: 400, message };
  }
}

/* ----------------------------- History ------------------------------ */

export interface HistoryArgs {
  area?: AreaType | "all";
  /** ISO timestamp lower bound (inclusive). */
  from?: string;
  /** ISO timestamp upper bound (exclusive). */
  to?: string;
  /** Case-insensitive partial match on session label. */
  label?: string;
}

export async function fetchHistory(
  args: HistoryArgs = {},
): Promise<GroupSession[] | null> {
  try {
    await ready();
    return localdb.listHistory({
      area: args.area === "all" ? undefined : args.area,
      from: args.from,
      to: args.to,
      label: args.label,
    });
  } catch (err) {
    console.warn("[localdb] fetchHistory failed", err);
    return null;
  }
}

/* ----------------------------- Products ----------------------------- */

export interface ProductsResponse {
  categories: Category[];
  products: Product[];
}

export interface FetchProductsOptions {
  /** Kept for API-shape compatibility; there's no in-flight request to abort locally. */
  signal?: AbortSignal;
}

export async function fetchProducts(
  _opts: FetchProductsOptions = {},
): Promise<ProductsResponse | null> {
  try {
    await ready();
    return { categories: localdb.listCategories(), products: localdb.listProducts() };
  } catch (err) {
    console.warn("[localdb] fetchProducts failed", err);
    return null;
  }
}

export async function createCategoryRemote(
  name: string,
  order: number,
): Promise<Category | null> {
  try {
    await ready();
    return localdb.createCategory(name, order);
  } catch (err) {
    console.warn("[localdb] createCategoryRemote failed", err);
    return null;
  }
}

export async function deleteCategoryRemote(id: string): Promise<boolean> {
  try {
    await ready();
    localdb.deleteCategory(id);
    return true;
  } catch (err) {
    console.warn("[localdb] deleteCategoryRemote failed", err);
    return false;
  }
}

export interface CreateProductInput {
  categoryId: string;
  name: string;
  price: number;
}

export async function createProductRemote(
  input: CreateProductInput,
): Promise<Product | null> {
  try {
    await ready();
    return localdb.createProduct(input.categoryId, input.name, input.price);
  } catch (err) {
    console.warn("[localdb] createProductRemote failed", err);
    return null;
  }
}

export interface UpdateProductInput {
  name?: string;
  price?: number;
  categoryId?: string;
}

export async function updateProductRemote(
  id: string,
  patch: UpdateProductInput,
): Promise<Product | null> {
  try {
    await ready();
    return localdb.updateProduct(id, patch);
  } catch (err) {
    console.warn("[localdb] updateProductRemote failed", err);
    return null;
  }
}

export async function deleteProductRemote(id: string): Promise<boolean> {
  try {
    await ready();
    localdb.deleteProduct(id);
    return true;
  } catch (err) {
    console.warn("[localdb] deleteProductRemote failed", err);
    return false;
  }
}

/* ----------------------------- Settings ----------------------------- */

export async function fetchAreasConfig(): Promise<AreaConfig[] | null> {
  try {
    await ready();
    return localdb.listAreaSettings();
  } catch (err) {
    console.warn("[localdb] fetchAreasConfig failed", err);
    return null;
  }
}

export interface PatchAreaInput {
  area: AreaType;
  /** Optional fields to override. */
  label?: string;
  tableCount?: number;
  hourlyRate?: number | null;
}

export type PatchAreaOk = { ok: true; area: AreaConfig };
export type PatchAreaFail = { ok: false; status: number; message: string };

export async function patchAreaConfig(
  input: PatchAreaInput,
): Promise<PatchAreaOk | PatchAreaFail> {
  try {
    await ready();
    const area = localdb.updateAreaSettings(input.area, {
      label: input.label,
      tableCount: input.tableCount,
      hourlyRate: input.hourlyRate,
    });
    return { ok: true, area };
  } catch (err) {
    const message = err instanceof Error ? err.message : "تعذّر حفظ الإعدادات.";
    console.warn("[localdb] patchAreaConfig failed", err);
    return { ok: false, status: 400, message };
  }
}
