"use client";

/**
 * OtaUpdater — invisible-until-ready root-level component that checks for
 * OTA updates hourly via @capgo/capacitor-updater, self-hosted against the
 * same Supabase Storage bucket used for backups (public-read manifest,
 * no key needed — see lib/cloud/ota.ts).
 *
 * Same setTimeout self-rescheduling + missed-run catch-up pattern as
 * CloudBackupScheduler.tsx / DailyReporter.tsx. Differs in one important
 * way: a found+downloaded update is never applied automatically. Staff
 * may be mid-edit on a bill when the check fires; forcing a reload would
 * destroy that in-progress work. Instead this shows a small dismissible
 * banner with a manual reload button, and the update just sits
 * downloaded-but-inactive until they tap it (or until the next natural
 * app restart, if @capgo is configured to auto-apply on next launch —
 * this component never calls `set()` on its own).
 *
 * `notifyAppReady()` is mandatory on every mount: it's the acknowledgment
 * that this JS bundle booted successfully, which is what lets @capgo
 * auto-roll-back a bad update on the *next* launch if this one is never
 * acknowledged (e.g. the update crashed before mount).
 *
 * Render: null unless an update is ready, in which case a small banner.
 * Mount once in app/layout.tsx, next to <DailyReporter /> and
 * <CloudBackupScheduler />.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Preferences } from "@capacitor/preferences";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { checkForUpdate, applyUpdate } from "@/lib/cloud/ota";

const KEY_SUPABASE_URL = "cloud.supabaseUrl";
const KEY_BUCKET = "cloud.bucket";
const KEY_LAST_CHECK_AT = "ota.lastCheckAt";

const HOURLY_INTERVAL_MS = 3_600_000;

async function getConfig(): Promise<{ supabaseUrl: string; bucket: string } | null> {
  const [u, b] = await Promise.all([
    Preferences.get({ key: KEY_SUPABASE_URL }),
    Preferences.get({ key: KEY_BUCKET }),
  ]);
  const supabaseUrl = u.value?.trim();
  const bucket = b.value?.trim();
  if (!supabaseUrl || !bucket) return null;
  return { supabaseUrl, bucket };
}

/** Same re-entrancy guard shape as the other two schedulers. */
let isRunning = false;

export default function OtaUpdater(): JSX.Element | null {
  const [ready, setReady] = useState<{ version: string; bundleId: string } | null>(null);
  const [reloading, setReloading] = useState(false);
  // document.body only exists post-mount — see BillSummaryBar.tsx's header
  // comment for the full rationale on why the banner is portaled out of
  // .app-shell instead of rendered inline.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Mandatory acknowledgment on every mount — see file header.
    void CapacitorUpdater.notifyAppReady();
  }, []);

  useEffect(() => {
    let armed = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tryCheck = async (): Promise<void> => {
      if (isRunning) return;
      isRunning = true;
      try {
        const config = await getConfig();
        if (!config) return; // not configured yet — nothing to check against
        const result = await checkForUpdate(config);
        await Preferences.set({ key: KEY_LAST_CHECK_AT, value: new Date().toISOString() });
        if (!armed) return;
        if (result.status === "updated") {
          setReady({ version: result.version, bundleId: result.bundleId });
        }
        // "up-to-date" and "error" both just mean no banner this cycle —
        // errors here are transient network conditions, not something to
        // interrupt the user about; the next hourly check retries.
      } finally {
        isRunning = false;
      }
    };

    const schedule = (): void => {
      if (!armed) return;
      timer = setTimeout(async () => {
        if (!armed) return;
        await tryCheck();
        schedule();
      }, HOURLY_INTERVAL_MS);
    };

    (async () => {
      const last = await Preferences.get({ key: KEY_LAST_CHECK_AT });
      const lastAt = last.value ? new Date(last.value).getTime() : 0;
      const dueNow = !lastAt || Date.now() - lastAt >= HOURLY_INTERVAL_MS;
      if (dueNow) {
        await tryCheck();
      }
      schedule();
    })();

    return () => {
      armed = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!ready || !mounted) return null;

  return createPortal(
    <div
      role="status"
      dir="rtl"
      className="fixed bottom-4 inset-x-4 z-40 md:left-auto md:right-4 md:w-96 bg-espresso-900 border border-copper-700 rounded-2xl shadow-warm px-4 py-3 flex items-center justify-between gap-3"
      style={{
        // Re-apply the phone-fit scale .app-shell normally provides — see
        // BillSummaryBar.tsx for why this must be portaled + re-scaled.
        transform: "scale(var(--app-scale))",
        transformOrigin: "bottom center",
      }}
    >
      <span className="text-sm text-espresso-100 font-bold">
        تحديث جاهز — إعادة تشغيل الآن
      </span>
      <button
        type="button"
        disabled={reloading}
        onClick={async () => {
          setReloading(true);
          try {
            await applyUpdate(ready.bundleId);
          } catch {
            setReloading(false);
          }
        }}
        className="min-h-[40px] px-4 rounded-xl bg-copper-600 hover:bg-copper-500 disabled:opacity-60 text-espresso-50 font-bold text-sm transition-colors duration-200"
      >
        {reloading ? "…" : "إعادة التشغيل"}
      </button>
    </div>,
    document.body,
  );
}
