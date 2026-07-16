"use client";

/**
 * DailyReporter — invisible root-level component that schedules the
 * 6 AM daily Telegram report.
 *
 * Hybrid approach (see architecture spec for why):
 *   1. On mount, check if the report already ran today (Preferences
 *      key `tg.lastRunDate`). If not AND local time is past 6 AM,
 *      run it now — covers the case where the app was force-killed
 *      at 5:59 AM and the user re-opens it at 7 AM.
 *   2. Schedule a setTimeout for the next 6 AM. After it fires,
 *      run the report, then reschedule for the following day.
 *   3. Every run is logged to `tg.lastLog` (rolling 10-entry buffer)
 *      so the Settings UI can show "last successful run" + recent
 *      failures.
 *
 * Reliable when the app stays open. If the user force-kills the app
 * at 5:59 AM, the report still runs on the next launch as long as
 * the launch is after 6 AM (the missed-run check picks it up).
 *
 * Render: returns null. Mount once in app/layout.tsx.
 */

import { useEffect } from "react";
import { Preferences } from "@capacitor/preferences";
import { runDailyReport, type ReportLog } from "@/lib/telegram/reporter";
import { TELEGRAM_BOT_TOKEN } from "@/lib/telegram/defaults";

const KEY_CHAT_ID = "tg.chatId";
const KEY_LAST_RUN = "tg.lastRunDate";
const KEY_LAST_LOG = "tg.lastLog";

const SCHEDULE_HOUR = 6;
const SCHEDULE_MINUTE = 0;
const MAX_LOG_ENTRIES = 10;

async function getConfig(): Promise<{ botToken: string; chatId: string } | null> {
  const c = await Preferences.get({ key: KEY_CHAT_ID });
  const chatId = c.value?.trim();
  if (!chatId) return null;
  return { botToken: TELEGRAM_BOT_TOKEN, chatId };
}

async function readLastLog(): Promise<ReportLog[]> {
  const r = await Preferences.get({ key: KEY_LAST_LOG });
  if (!r.value) return [];
  try {
    const parsed = JSON.parse(r.value);
    return Array.isArray(parsed) ? (parsed as ReportLog[]) : [];
  } catch {
    return [];
  }
}

async function appendLog(
  existing: ReportLog[],
  entry: ReportLog,
): Promise<ReportLog[]> {
  const next = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
  await Preferences.set({ key: KEY_LAST_LOG, value: JSON.stringify(next) });
  return next;
}

function msUntilNext6Am(now: Date = new Date()): number {
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    SCHEDULE_HOUR,
    SCHEDULE_MINUTE,
    0,
    0,
  );
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function todayDateString(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function tryRun(): Promise<void> {
  const config = await getConfig();
  let result: { status: "sent" | "skipped" | "failed"; message: string; date: string };
  if (!config) {
    result = {
      status: "failed",
      message: "لم يتم الإرسال — يلزم تكوين بوت تيليجرام في الإعدادات.",
      date: todayDateString(),
    };
  } else {
    result = await runDailyReport(config);
  }
  // lastRunDate tracks the *day we attempted the run* (today), NOT
  // result.date (which is yesterday's day — the day the report
  // covers). Otherwise the missed-run check (lastRunDate !== today)
  // would never match and the report would re-fire on every app
  // open. We also only mark "done for today" on sent/skipped —
  // failures leave the old lastRunDate in place so the next app
  // launch retries (network blips, 5xx, etc. self-heal).
  //
  // Both post-run state writes (lastRunDate + the rolling log) are
  // best-effort: if Preferences throws (full disk, OS revoke, the
  // WebView being torn down mid-write) the report itself already
  // happened — we don't want a storage hiccup to surface as an
  // unhandled rejection that masks the successful run.
  try {
    if (result.status !== "failed") {
      await Preferences.set({ key: KEY_LAST_RUN, value: todayDateString() });
    }
    const kind: ReportLog["kind"] =
      result.status === "sent"
        ? "success"
        : result.status === "skipped"
          ? "skipped"
          : "error";
    await appendLog(await readLastLog(), {
      at: new Date().toISOString(),
      kind,
      message: result.message,
    });
  } catch (e) {
    console.warn("[DailyReporter] failed to persist post-run state:", e);
  }
}

export default function DailyReporter(): null {
  useEffect(() => {
    let armed = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (): void => {
      if (!armed) return;
      const delay = msUntilNext6Am();
      timer = setTimeout(async () => {
        if (!armed) return;
        await tryRun();
        schedule();
      }, delay);
    };

    (async () => {
      // Missed-run check: if today's report hasn't been marked done
      // AND we're past 6 AM local, run it now. This covers the
      // "app was closed at 6:00 sharp" case — the report still
      // fires the next time the user opens the app.
      const today = todayDateString();
      const last = await Preferences.get({ key: KEY_LAST_RUN });
      if (last.value !== today) {
        const now = new Date();
        const sixAmToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          SCHEDULE_HOUR,
          SCHEDULE_MINUTE,
          0,
          0,
        );
        if (now.getTime() >= sixAmToday.getTime()) {
          await tryRun();
        }
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
