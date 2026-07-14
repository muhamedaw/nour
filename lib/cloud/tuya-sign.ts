/**
 * Tuya OpenAPI v1.0 signing — pure Web Crypto, no Capacitor / no DOM.
 *
 * Extracted out of lib/cloud/tuya.ts so the unit test can import and
 * exercise the actual signer (Node 22+ ships the same Web Crypto API
 * as the browser).  tuya.ts wraps these helpers in its own session
 * cache + business logic; this file owns everything that must be
 * deterministic for a given input, nothing else.
 *
 * The signRequest function takes an optional `clockOverride` so tests
 * can pin `t` and `nonce` to known values and produce a reproducible
 * HMAC vector.  In production callers omit it and the real wall-clock
 * + crypto.randomUUID() path runs unchanged.
 */

/* ------------------------------------------------------------------------ */
/* Public types (subset of tuya.ts; reproduced here so this file has no     */
/* compile-time dependency on the Capacitor-bound module).                  */
/* ------------------------------------------------------------------------ */

export type TuyaRegion = "us" | "eu" | "cn" | "in";

export interface TuyaConfig {
  accessId: string;
  accessSecret: string;
  apiBase: string;
  region: TuyaRegion;
}

export interface SignOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Provided = "service-management" call, NOT a token-grant call. */
  accessToken?: string;
}

export interface SignedRequest {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** Override hook for deterministic tests (don't pass in production). */
export interface ClockOverride {
  t?: string;
  nonce?: string;
}

/* ------------------------------------------------------------------------ */
/* Constants                                                                */
/* ------------------------------------------------------------------------ */

/** SHA-256 of the empty string — Tuya requires this literal hash when a
 *  request has no body (any GET, or a POST with an empty body). */
export const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/* ------------------------------------------------------------------------ */
/* Byte + crypto helpers                                                    */
/* ------------------------------------------------------------------------ */

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * Web Crypto's TS 5.6 typings narrow `BufferSource` to ArrayBufferView
 * over an `ArrayBuffer` specifically; `TextEncoder.encode()` returns
 * `Uint8Array<ArrayBufferLike>` (a `SharedArrayBuffer`-compatible union)
 * which fails assignment semantics on the stricter surface.
 *
 * .slice() always returns a brand-new ArrayBuffer (SharedArrayBuffer
 * has no .slice) — this gives us a guaranteed-non-shared, non-shared
 * sized buffer that satisfies BufferSource. Doing it once here means
 * the call sites below can pass the bytes through with no casts.
 */
function copyAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Runtime is always a plain ArrayBuffer here (TextEncoder.encode() and
  // sql.js/crypto byte arrays never wrap a SharedArrayBuffer) — the cast
  // just resolves a TS 5.6 typings gap where `.buffer` widens to
  // `ArrayBufferLike` and `.slice()` doesn't re-narrow it back down.
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Convert a byte sequence to the uppercase 64-char hex Tuya expects.
 *  padStart is critical — mishaped "a" instead of "0a" fails Tuya's
 *  signature check without an obvious error. */
export function bytesToHexUpper(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < u8.length; i++) {
    out += u8[i].toString(16).padStart(2, "0");
  }
  return out.toUpperCase();
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", copyAsArrayBuffer(bytes));
  return bytesToHexUpper(buf);
}

export async function hmacSha256Hex(
  message: string,
  secretBytes: Uint8Array,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    copyAsArrayBuffer(secretBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    copyAsArrayBuffer(utf8(message)),
  );
  return bytesToHexUpper(sig);
}

export function pickNonce(): string {
  // crypto.randomUUID is fully available in modern WebViews + Chromium 92+
  // AND in Node 14.17+. Fallback is a 75-bit entropy string if for some
  // reason it's missing.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

/**
 * Sort query string parameters alphabetically by key (Tuya requirement
 * for the canonical `Url` line in the string-to-sign). URLSearchParams
 * already decodes both sides; we re-encode with encodeURIComponent to
 * normalise any odd whitespace (`+` vs `%20`) that can sneak in.
 */
export function canonicalQuery(q: Record<string, string>): string {
  const entries = Object.entries(q).sort(([a], [b]) => a.localeCompare(b));
  return entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/* ------------------------------------------------------------------------ */
/* Signer                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Sign a Tuya OpenAPI request and yield the ready-to-fetch descriptor.
 *
 *  stringToSign = METHOD + "\n" + Content-SHA256 + "\n" + Headers + "\n" + Url
 *  Headers      = only the headers involved in signing (client_id, t, nonce,
 *                 access_token if set), lowercased keys, alphabetical order,
 *                 joined as `key:value\n` blocks (terminating newline is part
 *                 of the spec — kept even if no headers).
 *  Url          = path + (sortedQueryParams ? "?" + sortedQueryParams : "")
 *
 *  For TOKEN endpoints (no accessToken): HMAC input =
 *      client_id + t + nonce + stringToSign
 *  For SERVICE-MGMT (accessToken present): HMAC input =
 *      client_id + access_token + t + nonce + stringToSign
 *
 *  Result hex is uppercase (lowercase on Tuya's side is rejected silently).
 *
 *  `clockOverride` lets the caller pin `t` and `nonce` for deterministic
 *  test fixture matching; production callers omit it.
 */
export async function signRequest(
  config: TuyaConfig,
  opts: SignOptions,
  clockOverride: ClockOverride = {},
): Promise<SignedRequest> {
  const method = opts.method.toUpperCase();
  const queryStr = canonicalQuery(opts.query ?? {});
  const url = opts.path + (queryStr ? `?${queryStr}` : "");

  const bodyText =
    opts.body !== undefined && opts.body !== null
      ? JSON.stringify(opts.body)
      : "";
  const bodyHash = bodyText ? await sha256Hex(utf8(bodyText)) : EMPTY_BODY_SHA256;

  const t = clockOverride.t ?? Date.now().toString();
  const nonce = clockOverride.nonce ?? pickNonce();

  // Headers involved in the signature (only these appear in the `Headers`
  // block of stringToSign). Always lowercase key — sort by that.
  const signingHeaders: Record<string, string> = {
    client_id: config.accessId,
    t,
    nonce,
  };
  if (opts.accessToken) {
    signingHeaders.access_token = opts.accessToken;
  }
  const headerKeys = Object.keys(signingHeaders).sort();
  const headersLine =
    headerKeys.map((k) => `${k}:${signingHeaders[k]}`).join("\n") + "\n";

  const stringToSign = `${method}\n${bodyHash}\n${headersLine}${url}`;

  // HMAC input order matters — exactly as documented.
  const signInput =
    config.accessId +
    (opts.accessToken ?? "") +
    t +
    nonce +
    stringToSign;
  const sign = await hmacSha256Hex(signInput, utf8(config.accessSecret));

  const reqHeaders: Record<string, string> = {
    client_id: config.accessId,
    sign,
    sign_method: "HMAC-SHA256",
    t,
    nonce,
  };
  if (bodyText) {
    reqHeaders["Content-Type"] = "application/json";
  }
  if (opts.accessToken) {
    reqHeaders.access_token = opts.accessToken;
  }

  return {
    method: opts.method,
    url: config.apiBase + url,
    headers: reqHeaders,
    body: bodyText || undefined,
  };
}
