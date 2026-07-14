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
import { isNewerVersion } from "./ota-version";

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

/**
 * Surface-area wrapper around the @capgo/capacitor-updater plugin so tests
 * can inject a fake without pulling in the native module (which throws
 * outside a Capacitor runtime). Wraps the two plugin calls this module
 * makes (`current` reads the live bundle version, `download` pulls a new
 * bundle and validates the caller-supplied checksum against the bytes
 * downloaded — a mismatch raises, which we surface as a download error).
 */
export interface UpdaterClient {
  current(): Promise<{ bundle: { version: string } }>;
  download(opts: { url: string; version: string; checksum: string }): Promise<{ id: string }>;
}

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

/** Builds the public Storage URL for the update manifest — exported so the
 *  URL shape itself is testable without touching the network. */
export function manifestUrl(config: OtaConfig): string {
  return `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${config.bucket}/app-updates/latest.json`;
}

const defaultClient: UpdaterClient = {
  current: async () => {
    const { bundle } = await CapacitorUpdater.current();
    return { bundle };
  },
  download: (opts) => CapacitorUpdater.download(opts),
};

const defaultFetcher = (url: string): Promise<Response> =>
  fetchWithTimeout(url, OTA_TIMEOUT_MS);

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
 *
 * `client` and `fetcher` are injected so tests can cover every branch
 * without loading the native Capacitor plugin. The runtime callers pass
 * nothing and get the real CapacitorUpdater-backed default client.
 */
export async function checkForUpdate(
  config: OtaConfig,
  deps: {
    client?: UpdaterClient;
    fetcher?: (url: string) => Promise<Response>;
  } = {}
): Promise<CheckResult> {
  const client = deps.client ?? defaultClient;
  const fetcher = deps.fetcher ?? defaultFetcher;
  try {
    const res = await fetcher(manifestUrl(config));
    if (!res.ok) {
      return { status: "error", message: `HTTP ${res.status}` };
    }
    const manifest = (await res.json()) as UpdateManifest;
    if (!manifest?.version || !manifest.url || !manifest.sha256) {
      return { status: "error", message: "بيان التحديث غير صالح." };
    }

    const { bundle: current } = await client.current();
    if (!isNewerVersion(current.version, manifest.version)) {
      return { status: "up-to-date" };
    }

    const downloaded = await client.download({
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
