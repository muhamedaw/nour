"use client";

import type {
  AreaType,
  Category,
  GroupSession,
  Product,
  SessionItem,
} from "@/lib/types";

/**
 * Central fetch client for the locked team's API.
 * Endpoints assumed (REST):
 *   GET    /api/sessions                       → GroupSession[] | { sessions: GroupSession[] }
 *   GET    /api/sessions?area=X&status=open    → same shape
 *   POST   /api/sessions                       → GroupSession
 *   PATCH  /api/sessions/[id]                  → GroupSession
 *   POST   /api/sessions/[id]/close            → GroupSession (closed)
 *   GET    /api/history?area=X&from=Y&to=Z     → GroupSession[] | { sessions }
 *   GET    /api/products                       → { categories, products }
 *   POST   /api/products/categories            → Category
 *   DELETE /api/products/categories/[id]       → 204
 *   POST   /api/products                       → Product
 *   PATCH  /api/products/[id]                  → Product
 *   DELETE /api/products/[id]                  → 204
 *
 * Every call degrades gracefully:
 *   • non-2xx          → console.warn + return null
 *   • network failure  → console.warn + return null
 *   • empty body       → treated as null
 *
 * The UI keeps working with local state while the API is being built;
 * nothing throws to the user.
 */

const BASE = "/api";

async function unwrap<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    if (typeof console !== "undefined") {
      console.warn(`[api] ${res.url} → HTTP ${res.status}`);
    }
    return null;
  }
  if (res.status === 204) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function queryString(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/* ----------------------------- Sessions ----------------------------- */

export type SessionsEnvelope = { sessions?: GroupSession[] } | GroupSession[];

function normalizeSessions(env: SessionsEnvelope | null | undefined): GroupSession[] {
  if (!env) return [];
  return Array.isArray(env) ? env : env.sessions ?? [];
}

export interface FetchSessionsArgs {
  area?: AreaType;
  status?: "open" | "closed";
}

export async function fetchSessions(
  args: FetchSessionsArgs = {},
): Promise<GroupSession[] | null> {
  const url = `${BASE}/sessions${queryString({
    area: args.area,
    status: args.status,
  })}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  const data = await unwrap<SessionsEnvelope>(res);
  return data === null ? null : normalizeSessions(data);
}

export async function openSessionRemote(
  area: AreaType,
  tableNumber: number,
  label?: string,
): Promise<GroupSession | null> {
  const url = `${BASE}/sessions`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ area, tableNumber, label }),
    });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<GroupSession>(res);
}

export interface PatchSessionInput {
  items?: SessionItem[];
  label?: string;
}

export async function patchSessionRemote(
  id: string,
  patch: PatchSessionInput,
): Promise<GroupSession | null> {
  const url = `${BASE}/sessions/${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<GroupSession>(res);
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
  const url = `${BASE}/sessions/${encodeURIComponent(id)}/close`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<GroupSession>(res);
}

/* ----------------------------- History ------------------------------ */

export interface HistoryArgs {
  area?: AreaType | "all";
  /** ISO timestamp lower bound (inclusive). */
  from?: string;
  /** ISO timestamp upper bound (exclusive). */
  to?: string;
}

export async function fetchHistory(
  args: HistoryArgs = {},
): Promise<GroupSession[] | null> {
  const url = `${BASE}/history${queryString({
    area: args.area === "all" ? undefined : args.area,
    from: args.from,
    to: args.to,
  })}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  const data = await unwrap<SessionsEnvelope>(res);
  return data === null ? null : normalizeSessions(data);
}

/* ----------------------------- Products ----------------------------- */

export interface ProductsResponse {
  categories: Category[];
  products: Product[];
}

export interface FetchProductsOptions {
  /** Optional AbortSignal — when aborted the in-flight fetch is cancelled. */
  signal?: AbortSignal;
}

export async function fetchProducts(
  opts: FetchProductsOptions = {},
): Promise<ProductsResponse | null> {
  const url = `${BASE}/products`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: opts.signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      // Caller checks opts.signal?.aborted before mutating state. We return
      // null so the caller can short-circuit if it forgot.
      return null;
    }
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<ProductsResponse>(res);
}

export async function createCategoryRemote(
  name: string,
  order: number,
): Promise<Category | null> {
  const url = `${BASE}/products/categories`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, order }),
    });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<Category>(res);
}

export async function deleteCategoryRemote(id: string): Promise<boolean> {
  const url = `${BASE}/products/categories/${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "DELETE" });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return false;
  }
  if (!res.ok) {
    console.warn(`[api] ${url} → HTTP ${res.status}`);
    return false;
  }
  return true;
}

export interface CreateProductInput {
  categoryId: string;
  name: string;
  price: number;
}

export async function createProductRemote(
  input: CreateProductInput,
): Promise<Product | null> {
  const url = `${BASE}/products`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<Product>(res);
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
  const url = `${BASE}/products/${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return null;
  }
  return unwrap<Product>(res);
}

export async function deleteProductRemote(id: string): Promise<boolean> {
  const url = `${BASE}/products/${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "DELETE" });
  } catch (err) {
    console.warn(`[api] ${url} network error`, err);
    return false;
  }
  if (!res.ok) {
    console.warn(`[api] ${url} → HTTP ${res.status}`);
    return false;
  }
  return true;
}
