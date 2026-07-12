/**
 * Telegram reporter — pure TS module for the 6 AM daily report.
 *
 * Responsibilities (no React, no Next.js — pure functions, unit-testable):
 *   • Build a CSV string from yesterday's closed sessions
 *   • Compute "yesterday's window" (00:00 local → today 00:00 local)
 *   • Query the local DB for sessions in that window
 *   • Send a plain text message via the Telegram Bot API
 *   • Send a CSV file as a document via the Bot API
 *   • Discover a chat ID by polling getUpdates (first-time setup)
 *   • Orchestrate the whole flow in `runDailyReport()`
 *
 * Storage (bot token, chat ID, last-run date, log) is the component
 * layer's concern — this module just consumes the { botToken, chatId }
 * pair it's handed. See components/telegram/DailyReporter.tsx and
 * components/settings/TelegramSettings.tsx.
 *
 * Persistence of the report itself (CSV + JSON sidecar in
 * Documents/reports/) lives in `./report-storage`. `runDailyReport`
 * calls `saveReportLocally` *before* attempting the Telegram send —
 * a Telegram failure never loses the local record, and a Telegram
 * success patches the sidecar afterwards to record the message id.
 *
 * Note on the bot token being in the bundle: this ships as a static-
 * exported APK. The bot token ends up in the JS bundle, which means
 * anyone with the APK can extract it. Accepted risk for v1 — a
 * single-tenant POS where losing the token means creating a new bot
 * (5 minutes of @BotFather work). The proper fix is a tiny server
 * proxy that holds the token and forwards the request; out of scope
 * for the offline-only architecture.
 */

import { listHistory } from "@/lib/localdb";
import type { GroupSession } from "@/lib/types";
import { saveReportLocally, updateMetadata } from "./report-storage";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export type SendResult =
  | { ok: true; messageId: number }
  | {
      ok: false;
      status: number;
      message: string;
      /** 429 (rate limit) and 5xx are worth retrying. 4xx (bad token, bad
       *  chat id, malformed request) are not — retrying won't help. */
      retryable: boolean;
    };

export interface ReportLog {
  at: string;
  kind: "success" | "skipped" | "error";
  message: string;
}

export type RunStatus = "sent" | "skipped" | "failed";

export interface RunResult {
  status: RunStatus;
  message: string;
  /** YYYY-MM-DD in local time — the calendar day the report covers. */
  date: string;
  rowCount: number;
  /** True iff the CSV was written to Documents/reports/. The local
   *  save happens regardless of Telegram success, so a Telegram
   *  failure can still pair with `savedLocally: true`. */
  savedLocally: boolean;
}

/** Subset of the Telegram Bot API response body we actually consume. */
interface TelegramResponse {
  ok?: boolean;
  result?: { message_id?: number };
  description?: string;
}

/** Per-request timeout for Telegram API calls. 30s is generous — the
 *  API normally responds in under 5s; anything longer means the network
 *  is wedged. With a timeout, the re-entrancy guard in `runDailyReport`
 *  can never deadlock on a hung fetch. */
const TELEGRAM_TIMEOUT_MS = 30_000;

// ------------------------------------------------------------------
// CSV
// ------------------------------------------------------------------

const CSV_HEADERS = [
  "session_id",
  "area",
  "table_number",
  "label",
  "opened_at",
  "closed_at",
  "product_name",
  "qty",
  "unit_price",
  "line_total",
  "session_billed_total",
] as const;

/** RFC 4180-style CSV field escape. */
function escapeCsvField(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowForSession(session: GroupSession): string[][] {
  if (session.items.length === 0) {
    // Time-based billing with no product line items (snooker, empty
    // cards session). Emit exactly one row with the session total and
    // empty product fields — never skip the session entirely, or
    // we'd silently drop all time-only revenue from the report.
    return [
      [
        session.id,
        session.area,
        String(session.tableNumber),
        session.label ?? "",
        session.openedAt,
        session.closedAt ?? "",
        "",
        "",
        "",
        "",
        String(session.billedTotal ?? ""),
      ],
    ];
  }
  // Product-based: one row per item. billedTotal repeats on every row
  // so a spreadsheet pivot / SUMIF can still compute it.
  return session.items.map((item) => [
    session.id,
    session.area,
    String(session.tableNumber),
    session.label ?? "",
    session.openedAt,
    session.closedAt ?? "",
    item.name,
    String(item.qty),
    String(item.price),
    String(item.price * item.qty),
    String(session.billedTotal ?? ""),
  ]);
}

export function buildCsv(sessions: GroupSession[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(escapeCsvField).join(","));
  for (const session of sessions) {
    for (const row of rowForSession(session)) {
      lines.push(row.map(escapeCsvField).join(","));
    }
  }
  // UTF-8 BOM so Excel on Windows opens Arabic + digits in the right
  // encoding without the user having to fiddle with "Import Data".
  return "\uFEFF" + lines.join("\r\n");
}

// ------------------------------------------------------------------
// "Yesterday" window
// ------------------------------------------------------------------

/**
 * Returns [from, to] ISO timestamps for "yesterday 00:00 local" to
 * "today 00:00 local", plus the YYYY-MM-DD date string for "yesterday"
 * — the calendar day the report covers.
 *
 * Calendar-day interpretation (not "last 24h", not "6 AM to 6 AM")
 * because:
 *   • Matches the user's mental model ("yesterday's report")
 *   • Aligns with the bill / invoice numbering the accountant will use
 *   • Sessions that span midnight naturally land on the day they
 *     *closed*, which is the day the money actually came in.
 *
 * Important: the boundaries use the local-time Date constructor
 * (new Date(year, month, day, 0, 0, 0, 0)) and then `.toISOString()`
 * to convert to UTC. Do NOT use `new Date(Date.UTC(...))` — that
 * would re-introduce UTC and shift the window by the user's offset
 * (e.g. an Israel-based shop at UTC+3 would get the report covering
 * 21:00 the day-before-yesterday instead of 00:00 yesterday). The
 * `listHistory` filter then compares these UTC ISO strings against
 * the `closed_at` column (also stored as UTC ISO), which works
 * correctly because both sides are in UTC.
 */
export function yesterdayWindow(now: Date = new Date()): {
  from: string;
  to: string;
  date: string;
} {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const date = `${startOfYesterday.getFullYear()}-${String(
    startOfYesterday.getMonth() + 1,
  ).padStart(2, "0")}-${String(startOfYesterday.getDate()).padStart(2, "0")}`;
  return {
    from: startOfYesterday.toISOString(),
    to: startOfToday.toISOString(),
    date,
  };
}

// ------------------------------------------------------------------
// Local DB query
// ------------------------------------------------------------------

/**
 * Fetch all sessions closed during yesterday's window.
 *
 * `limit` is set very high because:
 *   • A single shop's daily close count is small (dozens, not
 *     thousands) — well within sql.js's synchronous query budget.
 *   • The lib/localdb `listHistory` default of 100 is too low for
 *     high-volume days.
 */
export function fetchYesterdaySessions(limit = 100_000): GroupSession[] {
  const { from, to } = yesterdayWindow();
  return listHistory({ from, to, limit });
}

// ------------------------------------------------------------------
// Telegram API
// ------------------------------------------------------------------

const TELEGRAM_API_BASE = "https://api.telegram.org";

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

export async function sendTextMessage(
  config: TelegramConfig,
  text: string,
): Promise<SendResult> {
  const url = `${TELEGRAM_API_BASE}/bot${config.botToken}/sendMessage`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: config.chatId, text }),
      },
      TELEGRAM_TIMEOUT_MS,
    );
    return parseTelegramResponse(res);
  } catch (err) {
    return mapNetworkError(err);
  }
}

export async function sendCsvDocument(
  config: TelegramConfig,
  filename: string,
  csvText: string,
  caption?: string,
): Promise<SendResult> {
  const url = `${TELEGRAM_API_BASE}/bot${config.botToken}/sendDocument`;
  const form = new FormData();
  form.append("chat_id", config.chatId);
  // text/csv MIME type so Telegram's "preview" is reasonable and so
  // a tap-to-download saves the right extension on most devices.
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  form.append("document", blob, filename);
  if (caption) form.append("caption", caption);
  try {
    const res = await fetchWithTimeout(
      url,
      { method: "POST", body: form },
      TELEGRAM_TIMEOUT_MS,
    );
    return parseTelegramResponse(res);
  } catch (err) {
    return mapNetworkError(err);
  }
}

async function parseTelegramResponse(res: Response): Promise<SendResult> {
  let body: TelegramResponse | null = null;
  try {
    body = (await res.json()) as TelegramResponse;
  } catch {
    return {
      ok: false,
      status: res.status,
      message: `HTTP ${res.status} (unparseable)`,
      retryable: res.status >= 500,
    };
  }
  if (body?.ok === true && body.result?.message_id) {
    return { ok: true, messageId: body.result.message_id };
  }
  return {
    ok: false,
    status: res.status,
    message: body?.description ?? `HTTP ${res.status}`,
    // 401/403 = bad token/chat → don't retry. 400 = bad request → don't
    // retry. 429 = rate limit → retry. 5xx = server error → retry.
    retryable: res.status === 429 || res.status >= 500,
  };
}

function mapNetworkError(err: unknown): SendResult {
  const e = err as Error & { name?: string };
  if (e?.name === "AbortError") {
    return {
      ok: false,
      status: 0,
      message: "انتهت مهلة الاتصال بـ تيليجرام.",
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
// Chat ID discovery (one-time setup)
// ------------------------------------------------------------------

/**
 * Polls getUpdates for the most recent user message addressed to the
 * bot and returns the sender's chat ID. The user must send ANY message
 * to the bot from their phone first (just opening the chat isn't
 * enough — Telegram only sends an update when the user actually
 * sends something).
 *
 * Guards:
 *   • `allowed_updates=["message"]` keeps the response payload small.
 *     We deliberately don't include `["channel_post"]` — a single-shop
 *     deployment only ever talks via direct messages.
 *   • `timeout=0` short-circuits the long-poll (we don't want to hold
 *     the WebView open waiting for a message that may have already
 *     arrived — the user pressed the button *after* messaging).
 *   • `limit=10` caps the backlog (we only need the latest one).
 *   • We skip `from.is_bot === true` so an admin testing the bot
 *     in another chat (or another bot messaging ours) doesn't capture
 *     the wrong chat_id.
 */
export async function discoverChatId(botToken: string): Promise<string | null> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/getUpdates?timeout=0&limit=10&allowed_updates=${encodeURIComponent(
    '["message"]',
  )}`;
  try {
    const res = await fetchWithTimeout(url, {}, TELEGRAM_TIMEOUT_MS);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: boolean;
      result?: Array<{
        message?: {
          chat?: { id?: number | string };
          from?: { is_bot?: boolean };
        };
      }>;
    };
    if (!body?.ok || !Array.isArray(body.result)) return null;
    // Walk newest → oldest. Take the first non-bot message.
    for (let i = body.result.length - 1; i >= 0; i--) {
      const msg = body.result[i]?.message;
      if (!msg || msg.from?.is_bot === true) continue;
      const chatId = msg.chat?.id;
      if (chatId !== undefined && chatId !== null) return String(chatId);
    }
    return null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// High-level: the actual report run
// ------------------------------------------------------------------

/**
 * Module-level re-entrancy guard. The on-mount "missed-run" check and
 * the setTimeout-fired run can both kick off within a few milliseconds
 * of each other (React StrictMode double-mounts in dev, or the user
 * reopening the app right at 6:00 AM). Without this guard, both
 * would POST the same CSV to Telegram in parallel — wasted bandwidth
 * and a duplicate message in the owner's chat.
 *
 * The second call returns a synthetic "skipped" result with the
 * current date so the caller's logging still records that we noticed
 * the overlap (and so the caller's "set lastRunDate" logic doesn't
 * clobber anything).
 *
 * Safety: each Telegram call has a 30s timeout, so even on a wedged
 * network this function returns within ~30s and the guard releases.
 */
let isRunning = false;
export async function runDailyReport(
  config: TelegramConfig,
): Promise<RunResult> {
  if (isRunning) {
    const window = yesterdayWindow();
    return {
      status: "skipped",
      message: "تم تشغيل تقرير آخر بالفعل — تم تجاهل هذه المحاولة.",
      date: window.date,
      rowCount: 0,
      savedLocally: false,
    };
  }
  isRunning = true;
  try {
    const window = yesterdayWindow();
    const sessions = fetchYesterdaySessions();
    if (sessions.length === 0) {
      return {
        status: "skipped",
        message: "لا توجد مبيعات أمس.",
        date: window.date,
        rowCount: 0,
        savedLocally: false,
      };
    }
    const csv = buildCsv(sessions);
    const filename = `nour-sales-${window.date}.csv`;
    const totalRevenue = sessions.reduce(
      (sum, s) => sum + (s.billedTotal ?? 0),
      0,
    );
    const sessionCount = sessions.length;
    const csvRowCount = csv.split("\r\n").length - 1; // minus the BOM header line

    // 1) Save locally FIRST, so a Telegram failure never loses the
    //    record. The Telegram send below patches the sidecar
    //    afterwards with the result.
    const localSave = await saveReportLocally(window.date, csv, {
      sessionCount,
      totalRevenue,
      csvRowCount,
      telegramSent: false,
    });
    const savedLocally = localSave.ok;

    // 2) Build the caption, then attempt the Telegram send.
    const caption =
      `📊 تقرير مبيعات ${window.date}\n` +
      `عدد الجلسات: ${sessionCount}\n` +
      `الإجمالي: ₪${totalRevenue.toFixed(2)}`;
    const result = await sendCsvDocument(config, filename, csv, caption);

    // 3) Patch the sidecar with the Telegram result (best-effort —
    //    a patch failure must not undo the local save).
    if (result.ok) {
      void updateMetadata(window.date, {
        telegramSent: true,
        telegramMessageId: result.messageId,
      });
      return {
        status: "sent",
        message: savedLocally
          ? "تم إرسال التقرير وحفظه محليًا."
          : "تم إرسال التقرير (تعذّر الحفظ المحلي).",
        date: window.date,
        rowCount: sessionCount,
        savedLocally,
      };
    }
    // Telegram send failed — surface the failure, but keep the
    // `savedLocally: true` flag so the UI can tell the user "the
    // report IS on your device, just not on Telegram".
    let suffix = "";
    if (savedLocally) {
      suffix = " (لكن التقرير محفوظ محليًا — يمكنك مشاركته يدويًا من قسم التقارير المحفوظة).";
    }
    return {
      status: "failed",
      message: `${result.message}${suffix}`,
      date: window.date,
      rowCount: sessionCount,
      savedLocally,
    };
  } finally {
    isRunning = false;
  }
}
