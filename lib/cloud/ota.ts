/**
 * OTA update check — pure TS module, mirrors lib/cloud/backup.ts's shape.
 *
 * Fetches a public JSON manifest from the same Supabase Storage bucket
 * backups use, compares its version against the currently-running bundle
 * (via @capgo/capacitor-updater), and downloads + verifies the new bundle
 * if one is available. Never applies it automatically — see
 * components/cloud/OtaUpdater.tsx for the "download now, reload later"
 * split that keeps an in-progress bill edit from being interrupted.
 *
 * The manifest path (`app-updates/latest.json`) is fetched from the
 * `/object/public/` Storage REST prefix, not the private `/object/`
 * prefix backups use — it needs no API key at all. This requires a
 * public-read Storage policy on the `app-updates/` path specifically
 * (see the manual setup note in the task report); `backups/` stays
 * private-write-only under the key-gated prefix in backup.ts.
 */

import { CapacitorUpdater } from "@capgo/capacitor-updater";

export interface OtaConfig {
  supabaseUrl: string;
  bucket: string;
}

export interface UpdateManifest {
  version: string;
  url: string;
  sha256: string;
}

export type CheckResult =
  | { status: "up-to-date" }
  | { status: "updated"; version: string; bundleId: string }
  | { status: "error"; message: string };

const OTA_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function manifestUrl(config: OtaConfig): string {
  return `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${config.bucket}/app-updates/latest.json`;
}

/**
 * Compares two version strings segment-by-segment as numbers (handles
 * "1.2.3"-style semver). Falls back to a plain string inequality check if
 * either side has a non-numeric segment (e.g. a build script ever switches
 * to timestamp-style versions like "20260714120000") — either way, `b` only
 * counts as newer than `a` when it's unambiguously greater.
 */
function isNewerVersion(current: string, candidate: string): boolean {
  const a = current.split(".");
  const b = candidate.split(".");
  const numericA = a.map(Number);
  const numericB = b.map(Number);
  if (numericA.every((n) => !Number.isNaN(n)) && numericB.every((n) => !Number.isNaN(n))) {
    const len = Math.max(numericA.length, numericB.length);
    for (let i = 0; i < len; i++) {
      const x = numericA[i] ?? 0;
      const y = numericB[i] ?? 0;
      if (y > x) return true;
      if (y < x) return false;
    }
    return false;
  }
  return candidate > current;
}

/**
 * Applies a previously-downloaded bundle (destroys the current JS context
 * and reloads — see CapacitorUpdater.set's docs). Called only from the
 * user's manual "reload now" tap in OtaUpdater.tsx, never automatically.
 */
export async function applyUpdate(bundleId: string): Promise<void> {
  await CapacitorUpdater.set({ id: bundleId });
}

/**
 * Checks the manifest, and if it points at a genuinely newer version,
 * downloads it (the plugin verifies `checksum` against the downloaded
 * bundle itself — see DownloadOptions.checksum — so a corrupted or
 * tampered download throws instead of silently installing) and returns
 * "updated" with the new bundle already downloaded (but not yet applied
 * — see OtaUpdater.tsx for why).
 */
export async function checkForUpdate(config: OtaConfig): Promise<CheckResult> {
  try {
    const res = await fetchWithTimeout(manifestUrl(config), OTA_TIMEOUT_MS);
    if (!res.ok) {
      return { status: "error", message: `HTTP ${res.status}` };
    }
    const manifest = (await res.json()) as UpdateManifest;
    if (!manifest?.version || !manifest.url || !manifest.sha256) {
      return { status: "error", message: "بيان التحديث غير صالح." };
    }

    const { bundle: current } = await CapacitorUpdater.current();
    if (!isNewerVersion(current.version, manifest.version)) {
      return { status: "up-to-date" };
    }

    const downloaded = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
      checksum: manifest.sha256,
    });

    return { status: "updated", version: manifest.version, bundleId: downloaded.id };
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e?.name === "AbortError") {
      return { status: "error", message: "انتهت مهلة الاتصال أثناء التحقق من التحديثات." };
    }
    return { status: "error", message: e?.message ?? "خطأ غير متوقع أثناء التحقق من التحديثات." };
  }
}
