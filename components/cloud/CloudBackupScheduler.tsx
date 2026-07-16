"use client";

/**
 * CloudBackupScheduler — invisible root-level component that schedules an
 * hourly encrypted DB snapshot upload to Supabase Storage.
 *
 * Same hybrid approach as components/telegram/DailyReporter.tsx, adapted
 * from a fixed clock-of-day schedule (6 AM) to a flat interval (hourly —
 * there's no "wrong time of day" for a backup, so no wall-clock alignment
 * is needed):
 *   1. On mount, check how long it's been since the last successful
 *      upload (Preferences key `cloud.lastBackupAt`, an ISO timestamp).
 *      If it's been at least an hour (or never happened), upload now —
 *      covers the case where the app was closed for hours and just
 *      reopened, instead of waiting up to another hour for the first run.
 *   2. Schedule a setTimeout for one hour out. After it fires, upload,
 *      then reschedule for the following hour.
 *   3. Every run is logged to `cloud.lastLog` (rolling 10-entry buffer)
 *      so the Settings UI can show "last successful backup" + recent
 *      failures, mirroring `tg.lastLog`.
 *
 * The staff password lives only in memory (see lib/localdb's
 * setCurrentStaffPassword, set once at login) — it's gone right after a
 * cold reload until the user unlocks again. If it's unavailable, this
 * skips the cycle silently and retries next hour rather than erroring;
 * nothing here should ever prompt the user or interrupt what they're doing.
 *
 * Render: returns null. Mount once in app/layout.tsx, next to
 * <DailyReporter />.
 */

import { useEffect } from "react";
import { Preferences } from "@capacitor/preferences";
import { getCurrentStaffPassword } from "@/lib/localdb";
import { uploadEncryptedBackup } from "@/lib/cloud/backup";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKET,
} from "@/lib/cloud/defaults";

const KEY_LAST_BACKUP_AT = "cloud.lastBackupAt";
const KEY_LAST_LOG = "cloud.lastLog";

const HOURLY_INTERVAL_MS = 3_600_000;
const MAX_LOG_ENTRIES = 10;

export interface CloudBackupLogEntry {
  at: string;
  kind: "success" | "skipped" | "error";
  message: string;
}

const CLOUD_CONFIG = {
  supabaseUrl: SUPABASE_URL,
  apiKey: SUPABASE_ANON_KEY,
  bucket: SUPABASE_BUCKET,
};

async function readLastLog(): Promise<CloudBackupLogEntry[]> {
  const r = await Preferences.get({ key: KEY_LAST_LOG });
  if (!r.value) return [];
  try {
    const parsed = JSON.parse(r.value);
    return Array.isArray(parsed) ? (parsed as CloudBackupLogEntry[]) : [];
  } catch {
    return [];
  }
}

async function appendLog(
  existing: CloudBackupLogEntry[],
  entry: CloudBackupLogEntry,
): Promise<CloudBackupLogEntry[]> {
  const next = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
  await Preferences.set({ key: KEY_LAST_LOG, value: JSON.stringify(next) });
  return next;
}

/**
 * Module-level re-entrancy guard — same rationale as reporter.ts's
 * `isRunning`: the on-mount catch-up check and a setTimeout firing can
 * both kick off within milliseconds of each other (React StrictMode
 * double-mount in dev), and without this guard both would PUT the same
 * snapshot to Supabase in parallel.
 */
let isRunning = false;

async function tryRun(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const password = getCurrentStaffPassword();
    if (!password) {
      // In-memory password wiped by a cold reload — skip silently and
      // retry next hour rather than erroring or prompting.
      await appendLog(await readLastLog(), {
        at: new Date().toISOString(),
        kind: "skipped",
        message: "تم التخطي — كلمة المرور غير متاحة في الذاكرة بعد إعادة التشغيل.",
      });
      return;
    }
    const result = await uploadEncryptedBackup(CLOUD_CONFIG, password);
    if (result.ok) {
      await Preferences.set({ key: KEY_LAST_BACKUP_AT, value: new Date().toISOString() });
      await appendLog(await readLastLog(), {
        at: new Date().toISOString(),
        kind: "success",
        message: "تم رفع نسخة احتياطية مشفّرة إلى السحابة.",
      });
    } else {
      await appendLog(await readLastLog(), {
        at: new Date().toISOString(),
        kind: "error",
        message: result.message,
      });
    }
  } catch (e) {
    // Never let a storage/network hiccup escape as an unhandled
    // rejection — best-effort logging only.
    try {
      await appendLog(await readLastLog(), {
        at: new Date().toISOString(),
        kind: "error",
        message: e instanceof Error ? e.message : "خطأ غير متوقع أثناء الرفع.",
      });
    } catch {
      // Logging itself failed — nothing more we can do this cycle.
    }
  } finally {
    isRunning = false;
  }
}

export default function CloudBackupScheduler(): null {
  useEffect(() => {
    let armed = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (): void => {
      if (!armed) return;
      timer = setTimeout(async () => {
        if (!armed) return;
        await tryRun();
        schedule();
      }, HOURLY_INTERVAL_MS);
    };

    (async () => {
      // Missed-run catch-up: if the last successful backup was an hour
      // or more ago (or never happened), upload now instead of waiting
      // out the rest of a fresh hour-long timer — covers the app being
      // closed for a while and then reopened.
      const last = await Preferences.get({ key: KEY_LAST_BACKUP_AT });
      const lastAt = last.value ? new Date(last.value).getTime() : 0;
      const dueNow = !lastAt || Date.now() - lastAt >= HOURLY_INTERVAL_MS;
      if (dueNow) {
        await tryRun();
      }
      schedule();
    })();

    return () => {
      armed = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
