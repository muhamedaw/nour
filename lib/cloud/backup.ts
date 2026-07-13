/**
 * Supabase cloud backup — pure TS module for the hourly off-device backup.
 *
 * Mirrors lib/telegram/reporter.ts's shape: a config the caller hands in,
 * fetchWithTimeout + AbortController, and the same SendResult union so the
 * UI can tell "retry automatically" apart from "needs user action" the
 * same way it already does for Telegram sends.
 *
 * Storage (Supabase URL, API key, bucket, last-upload timestamp, log) is
 * the component layer's concern — see components/cloud/CloudBackupScheduler.tsx
 * and components/settings/CloudBackupSettings.tsx.
 *
 * Note on the Supabase anon/API key being in the bundle: this ships as a
 * static-exported APK, so the key ends up in the JS bundle like the
 * Telegram bot token already does (see reporter.ts:24-30). Accepted risk
 * for v1 — the key only grants write access to a single private bucket
 * (via a Storage policy scoped to that bucket), and losing it means
 * rotating one key in the Supabase dashboard. The OTA update manifest
 * (lib/cloud/ota.ts) reads from a *public* path in the same bucket and
 * needs no key at all; only backups need this key, and only for writes.
 */

import { buildEncryptedBackupBlob } from "@/lib/localdb";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface CloudBackupConfig {
  supabaseUrl: string;
  apiKey: string;
  bucket: string;
}

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      message: string;
      /** 429 (rate limit) and 5xx are worth retrying. 4xx (bad key, bad
       *  bucket, malformed request) are not — retrying won't help. */
      retryable: boolean;
    };

/** Per-request timeout for Supabase Storage PUTs. Generous — an encrypted
 *  DB snapshot for a single-shop POS is small (KB, not MB), so 30s is
 *  already a wide margin over a healthy connection; anything longer means
 *  the network is wedged. */
const SUPABASE_TIMEOUT_MS = 30_000;

// ------------------------------------------------------------------
// fetch helper
// ------------------------------------------------------------------

/** fetch() wrapper with an AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function storageObjectUrl(config: CloudBackupConfig, path: string): string {
  return `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${config.bucket}/${path}`;
}

async function putObject(
  config: CloudBackupConfig,
  path: string,
  blob: Blob,
): Promise<SendResult> {
  const url = storageObjectUrl(config, path);
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "PUT",
        headers: {
          apikey: config.apiKey,
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/octet-stream",
          "x-upsert": "true",
        },
        body: blob,
      },
      SUPABASE_TIMEOUT_MS,
    );
    return parseSupabaseResponse(res);
  } catch (err) {
    return mapNetworkError(err);
  }
}

async function parseSupabaseResponse(res: Response): Promise<SendResult> {
  if (res.ok) return { ok: true };
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    message = body.message ?? body.error ?? message;
  } catch {
    // Non-JSON error body — keep the generic HTTP status message.
  }
  return {
    ok: false,
    status: res.status,
    message,
    // 401/403 = bad key/bucket → don't retry. 400/404 = bad request/missing
    // bucket → don't retry. 429 = rate limit → retry. 5xx = server error → retry.
    retryable: res.status === 429 || res.status >= 500,
  };
}

function mapNetworkError(err: unknown): SendResult {
  const e = err as Error & { name?: string };
  if (e?.name === "AbortError") {
    return {
      ok: false,
      status: 0,
      message: "انتهت مهلة الاتصال بـ Supabase.",
      retryable: true,
    };
  }
  return {
    ok: false,
    status: 0,
    message: e?.message ?? "Network error",
    retryable: true,
  };
}

// ------------------------------------------------------------------
// High-level: build + upload the encrypted snapshot
// ------------------------------------------------------------------

/** YYYY-MM-DD-HH in local time — one slot per hour, so the rolling
 *  history never grows past 24 objects (today's slots overwrite
 *  yesterday's same-hour slot). */
function hourlySlot(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

/**
 * Builds the encrypted DB snapshot and uploads it to two paths:
 *   - backups/latest.enc              (always overwritten — the "restore from cloud" target)
 *   - backups/history/{slot}.enc      (bounded 24-slot rolling history, one per hour-of-day)
 *
 * Uploads `latest.enc` first; if that fails, the history write is skipped
 * entirely and the failure result is returned immediately — no point
 * spending a second request on the history copy if the primary target
 * already failed for a retryable-or-not reason the caller needs to see.
 */
export async function uploadEncryptedBackup(
  config: CloudBackupConfig,
  password: string,
): Promise<SendResult> {
  const blob = await buildEncryptedBackupBlob(password);

  const latest = await putObject(config, "backups/latest.enc", blob);
  if (!latest.ok) return latest;

  const slot = hourlySlot();
  return putObject(config, `backups/history/${slot}.enc`, blob);
}
