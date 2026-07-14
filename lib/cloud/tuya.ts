"use client";

/**
 * Tuya / Smart Life Cloud OpenAPI client (v1.0).
 *
 * Implements the exact HMAC-SHA256 request-signing algorithm documented at
 * https://developer.tuya.com/en/docs/cloud/api-request-signing — six years
 * of community SDKs converge on the same shape so we don't redraw it here.
 *
 * Constraints (per the spec on this task):
 *   • NO external crypto library — Web Crypto API only (`crypto.subtle`).
 *   • Token never hits the network unboundedly: cached in Capacitor
 *     Preferences under region+clientId-scoped keys, refreshed ~5 min
 *     before reported `expire_time` (in seconds).
 *   • Region is selectable by staff (US/EU/CN/IN) so a Tuya account
 *     created in the wrong region is fixable without code edits.
 *
 * Layering note: this file owns the OAuth + signing transport. The other
 * team's `lib/cloud/backup.ts` and `components/cloud/*` sit in sibling
 * directories for OTA / encrypted backup plumbing — distinct concerns,
 * do not merge here.
 */

import { Preferences } from "@capacitor/preferences";
import {
  EMPTY_BODY_SHA256,
  signRequest,
  type SignOptions,
  type SignedRequest,
  type TuyaConfig,
  type TuyaRegion,
} from "./tuya-sign";

// Re-export so callers (TuyaSettings.tsx, app/ac/page.tsx) keep importing
// from "lib/cloud/tuya" without caring which file a symbol now lives in.
export type { TuyaRegion, TuyaConfig, SignOptions, SignedRequest } from "./tuya-sign";
export { EMPTY_BODY_SHA256 };

export const TUYA_REGIONS: Record<
  TuyaRegion,
  { label: string; apiBase: string }
> = {
  us: { label: "الولايات المتحدة (US)", apiBase: "https://openapi.tuyaus.com" },
  eu: { label: "أوروبا (EU)", apiBase: "https://openapi.tuyaeu.com" },
  cn: { label: "الصين (CN)", apiBase: "https://openapi.tuyacn.com" },
  in: { label: "الهند (IN)", apiBase: "https://openapi.tuyain.com" },
};

export interface TuyaDevice {
  id: string;
  name: string;
  online: boolean;
  category: string;
  productName?: string;
}

export interface TuyaDP {
  code: string;
  value: unknown;
}

export interface DPCommand {
  code: string;
  value: unknown;
}

export interface CommandResult {
  code: string;
  success: boolean;
  msg?: string;
}

export type TuyaResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

/* ------------------------------------------------------------------------ */
/* Constants                                                                */
/* ------------------------------------------------------------------------ */

// Refresh ~5 min before the Tuya-reported expiry. Buffer absorbs both
// network latency and POS clock drift between the device and the cloud.
const REFRESH_LEAD_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------------ */
/* HTTP transport                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Tuya's success response shape is `{ success: true, result: ..., t, ... }`;
 * failures are `{ success: false, code, msg }` with HTTP 200 OK. We treat
 * both transport errors AND `success:false` business failures as failures.
 */
async function httpJson<T>(
  signed: SignedRequest,
): Promise<TuyaResult<T>> {
  let res: Response;
  try {
    res = await fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message:
        err instanceof Error
          ? `تعذّر الاتصال بـ Tuya: ${err.message}`
          : "تعذّر الاتصال بـ Tuya.",
    };
  }

  let parsed: {
    success?: boolean;
    code?: number | string;
    msg?: string;
    result?: T;
  } | null = null;
  try {
    const text = await res.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Body wasn't JSON — surface as a generic failure.
  }

  if (parsed && parsed.success === false) {
    return {
      ok: false,
      status: res.status || 200,
      message:
        typeof parsed.msg === "string"
          ? parsed.msg
          : "فشل الطلب من جانب Tuya.",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        (parsed && typeof parsed.msg === "string"
          ? parsed.msg
          : `HTTP ${res.status}`) || "فشل الاتصال بـ Tuya.",
    };
  }
  // `result` is undefined for non-wrapped successes; fall through to the
  // parsed body itself so callers can pick what they need.
  const data = parsed && "result" in parsed ? parsed.result! : (parsed as T);
  return { ok: true, data, status: res.status };
}

/* ------------------------------------------------------------------------ */
/* Token cache                                                              */
/* ------------------------------------------------------------------------ */

interface StoredToken {
  access_token: string;
  refresh_token: string;
  expire_time: number; // seconds
  storedAt: number; // ms epoch
}

/** Prefs keys are namespaced per (region, accessId). We sanitize the
 *  accessId so a paste with stray punctuation won't break the key. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function k(region: TuyaRegion, accessId: string, suffix: string): string {
  return `tuya.${region}.${safeId(accessId)}.${suffix}`;
}

const K_AT = "at";
const K_RT = "rt";
const K_ET = "et";
const K_SA = "sa";

async function readStoredToken(
  config: TuyaConfig,
): Promise<StoredToken | null> {
  const [at, rt, et, sa] = await Promise.all([
    Preferences.get({ key: k(config.region, config.accessId, K_AT) }),
    Preferences.get({ key: k(config.region, config.accessId, K_RT) }),
    Preferences.get({ key: k(config.region, config.accessId, K_ET) }),
    Preferences.get({ key: k(config.region, config.accessId, K_SA) }),
  ]);
  if (!at.value || !rt.value || !et.value || !sa.value) return null;
  const expire = Number(et.value);
  const storedAt = Number(sa.value);
  if (!Number.isFinite(expire) || !Number.isFinite(storedAt)) return null;
  return {
    access_token: at.value,
    refresh_token: rt.value,
    expire_time: expire,
    storedAt,
  };
}

async function writeStoredToken(
  config: TuyaConfig,
  t: StoredToken,
): Promise<void> {
  await Promise.all([
    Preferences.set({
      key: k(config.region, config.accessId, K_AT),
      value: t.access_token,
    }),
    Preferences.set({
      key: k(config.region, config.accessId, K_RT),
      value: t.refresh_token,
    }),
    Preferences.set({
      key: k(config.region, config.accessId, K_ET),
      value: String(t.expire_time),
    }),
    Preferences.set({
      key: k(config.region, config.accessId, K_SA),
      value: String(t.storedAt),
    }),
  ]);
}

/** Clear the cache for the given config — call on Save so old tokens from
 *  a previous accessId/secret pair don't ghost into the new session. */
export async function clearStoredToken(config: TuyaConfig): Promise<void> {
  await Promise.all([
    Preferences.remove({ key: k(config.region, config.accessId, K_AT) }),
    Preferences.remove({ key: k(config.region, config.accessId, K_RT) }),
    Preferences.remove({ key: k(config.region, config.accessId, K_ET) }),
    Preferences.remove({ key: k(config.region, config.accessId, K_SA) }),
  ]);
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expire_time: number;
  uid?: string;
}

async function grantToken(
  config: TuyaConfig,
  grantType: "1" | "2",
  queryExtra: Record<string, string> = {},
): Promise<TuyaResult<TokenResponse>> {
  const signed = await signRequest(config, {
    method: grantType === "1" ? "POST" : "GET",
    path: "/v1.0/token",
    query: { grant_type: grantType, ...queryExtra },
  });
  return await httpJson<TokenResponse>(signed);
}

/** Ensure a valid access_token, using the cache and refreshing when
 *  within `REFRESH_LEAD_MS` of expiry. Falls back to fresh grant if
 *  refresh fails (so credential rotation works without wiping prefs). */
export async function ensureAccessToken(
  config: TuyaConfig,
): Promise<TuyaResult<{ access_token: string }>> {
  const cached = await readStoredToken(config);
  if (cached) {
    const expiresAtMs = cached.storedAt + cached.expire_time * 1000;
    if (Date.now() < expiresAtMs - REFRESH_LEAD_MS) {
      return {
        ok: true,
        data: { access_token: cached.access_token },
        status: 200,
      };
    }
    // Try refresh first (avoids the daily grant cost).
    const refreshed = await grantToken(config, "2", {
      refresh_token: cached.refresh_token,
    });
    if (refreshed.ok) {
      await writeStoredToken(config, {
        access_token: refreshed.data.access_token,
        refresh_token: refreshed.data.refresh_token,
        expire_time: refreshed.data.expire_time,
        storedAt: Date.now(),
      });
      return {
        ok: true,
        data: { access_token: refreshed.data.access_token },
        status: 200,
      };
    }
    // Refresh denied — clear and fall through to fresh grant.
    await clearStoredToken(config);
  }

  const fresh = await grantToken(config, "1");
  if (!fresh.ok) return { ok: false, status: fresh.status, message: fresh.message };
  await writeStoredToken(config, {
    access_token: fresh.data.access_token,
    refresh_token: fresh.data.refresh_token,
    expire_time: fresh.data.expire_time,
    storedAt: Date.now(),
  });
  return {
    ok: true,
    data: { access_token: fresh.data.access_token },
    status: 200,
  };
}

/* ------------------------------------------------------------------------ */
/* Public API surface                                                       */
/* ------------------------------------------------------------------------ */

/**
 * List devices bound to the linked Tuya Smart / Smart Life account.
 * Returns a minimal view (id, name, online, category, product_name).
 */
export async function listDevices(
  config: TuyaConfig,
): Promise<TuyaResult<TuyaDevice[]>> {
  const tok = await ensureAccessToken(config);
  if (!tok.ok) return tok;

  const signed = await signRequest(config, {
    method: "GET",
    path: "/v1.0/iot-01/associated-users/devices",
    accessToken: tok.data.access_token,
  });
  const res = await httpJson<unknown>(signed);
  if (!res.ok) return res;

  // Tuya's response wraps in `{ result: { list:[...], total, last_id } }`
  // for the user-devices endpoint; defensive against bare-array variants.
  const rawList: unknown[] = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as { list?: unknown[] } | null)?.list)
      ? ((res.data as { list: unknown[] }).list)
      : [];

  const devices: TuyaDevice[] = rawList.map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? o.device_id ?? ""),
      name: String(o.name ?? ""),
      online: Boolean(o.online),
      category: String(o.category ?? ""),
      productName:
        typeof o.product_name === "string" ? o.product_name : undefined,
    };
  });

  return { ok: true, data: devices, status: res.status };
}

/**
 * Fetch the current Data Point (DP) status of a single device. The status
 * is reported as a list of `{code, value}` — the UI uses this to decide
 * which controls (power, temperature stepper, mode selector) to render.
 */
export async function getDeviceStatus(
  config: TuyaConfig,
  deviceId: string,
): Promise<TuyaResult<TuyaDP[]>> {
  const tok = await ensureAccessToken(config);
  if (!tok.ok) return tok;

  const signed = await signRequest(config, {
    method: "GET",
    path: `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/status`,
    accessToken: tok.data.access_token,
  });
  const res = await httpJson<unknown>(signed);
  if (!res.ok) return res;

  // `result` is an array of `{code, value}` — defensive against a wrapped
  // object variant (status endpoints historically return either).
  const arr = Array.isArray(res.data)
    ? res.data
    : Array.isArray((res.data as { status?: unknown[] } | null)?.status)
      ? ((res.data as { status: unknown[] }).status)
      : [];

  const dps: TuyaDP[] = arr.map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      code: String(o.code ?? ""),
      value: o.value,
    };
  });

  return { ok: true, data: dps, status: res.status };
}

/**
 * Send one or more DP commands to a device.  Throws (in TuyaResult form)
 * if any individual command reports failure — callers can show the
 * failing DP code + message to staff.
 */
export async function sendCommand(
  config: TuyaConfig,
  deviceId: string,
  commands: DPCommand[],
): Promise<TuyaResult<CommandResult[]>> {
  if (commands.length === 0) {
    return { ok: true, data: [], status: 200 };
  }
  const tok = await ensureAccessToken(config);
  if (!tok.ok) return tok;

  const signed = await signRequest(config, {
    method: "POST",
    path: `/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`,
    accessToken: tok.data.access_token,
    body: { commands },
  });
  const res = await httpJson<unknown>(signed);
  if (!res.ok) return res;

  // Response shape varies: bare boolean (all succeeded), or per-command
  // array `[{code, success, msg}]`. Build a normalised CommandResult[].
  let perCommand: CommandResult[] = [];
  if (Array.isArray(res.data)) {
    perCommand = (res.data as Array<Record<string, unknown>>).map((r) => ({
      code: String(r.code ?? ""),
      success: Boolean(r.success),
      msg: typeof r.msg === "string" ? r.msg : undefined,
    }));
  } else if (typeof res.data === "boolean") {
    perCommand = commands.map((c) => ({
      code: c.code,
      success: res.data as boolean,
    }));
  }

  const failed = perCommand.find((r) => !r.success);
  if (failed) {
    return {
      ok: false,
      status: 400,
      message: `فشل تنفيذ الأمر "${failed.code}": ${
        failed.msg ?? "خطأ غير معروف من Tuya."
      }`,
    };
  }
  return { ok: true, data: perCommand, status: res.status };
}

/**
 * Convenience: toggle the universal on/off smart-plug DP code (`switch_1`).
 * Keep this the ONLY Tuya-specific DP assumption in the codebase — every
 * other DP (temp_set, temp_current, mode, …) should be discovered at
 * runtime from `getDeviceStatus`, not hardcoded here.
 */
export async function setPower(
  config: TuyaConfig,
  deviceId: string,
  on: boolean,
): Promise<TuyaResult<CommandResult[]>> {
  return await sendCommand(config, deviceId, [
    { code: "switch_1", value: on },
  ]);
}
