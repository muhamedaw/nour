"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import {
  discoverChatId,
  runDailyReport,
  sendTextMessage,
  type ReportLog,
} from "@/lib/telegram/reporter";
import { TELEGRAM_BOT_TOKEN } from "@/lib/telegram/defaults";
import TelegramSetupGuide, {
  TELEGRAM_GUIDE_DIALOG_ID,
} from "./TelegramSetupGuide";

const KEY_CHAT_ID = "tg.chatId";
const KEY_LAST_RUN = "tg.lastRunDate";
const KEY_LAST_LOG = "tg.lastLog";

type BusyKind = "detect" | "test" | "run" | null;

export default function TelegramStatus(): JSX.Element {
  const [chatId, setChatId] = useState("");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [log, setLog] = useState<ReportLog[]>([]);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpTriggerRef = useRef<HTMLButtonElement>(null);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    helpTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    (async () => {
      const [c, lr, ll] = await Promise.all([
        Preferences.get({ key: KEY_CHAT_ID }),
        Preferences.get({ key: KEY_LAST_RUN }),
        Preferences.get({ key: KEY_LAST_LOG }),
      ]);
      if (c.value) setChatId(c.value);
      if (lr.value) setLastRun(lr.value);
      if (ll.value) {
        try {
          const parsed = JSON.parse(ll.value);
          if (Array.isArray(parsed)) setLog(parsed as ReportLog[]);
        } catch {
          // Corrupt log — start fresh rather than blocking the page.
        }
      }
    })();
  }, []);

  async function detectChatId(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy("detect");
    try {
      const id = await discoverChatId(TELEGRAM_BOT_TOKEN);
      if (!id) {
        setErrorMsg(
          "تعذّر العثور على محادثة. افتح تيليجرام وأرسل أي رسالة للبوت، ثم اضغط الزر مرة أخرى.",
        );
        return;
      }
      setChatId(id);
      await Preferences.set({ key: KEY_CHAT_ID, value: id });
      setSuccessMsg("تم اكتشاف المحادثة وحفظها.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    const id = chatId.trim();
    if (!id) {
      setErrorMsg("اكتشف المحادثة أولًا.");
      return;
    }
    setBusy("test");
    try {
      const r = await sendTextMessage(
        { botToken: TELEGRAM_BOT_TOKEN, chatId: id },
        "اختبار من مقهى ترف — إذا وصلك هذا، فكل شيء يعمل بشكل سليم ✅",
      );
      if (r.ok) {
        setSuccessMsg("تم إرسال رسالة الاختبار إلى تيليجرام.");
      } else {
        setErrorMsg(`فشل الإرسال: ${r.message}`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function runNow(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    const id = chatId.trim();
    if (!id) {
      setErrorMsg("اكتشف المحادثة أولًا.");
      return;
    }
    setBusy("run");
    try {
      const r = await runDailyReport({
        botToken: TELEGRAM_BOT_TOKEN,
        chatId: id,
      });
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (r.status !== "failed") {
        await Preferences.set({ key: KEY_LAST_RUN, value: todayStr });
      }
      setLastRun(todayStr);
      const kind: ReportLog["kind"] =
        r.status === "sent"
          ? "success"
          : r.status === "skipped"
            ? "skipped"
            : "error";
      const entry: ReportLog = {
        at: new Date().toISOString(),
        kind,
        message: r.message,
      };
      const next = [entry, ...log].slice(0, 10);
      setLog(next);
      await Preferences.set({ key: KEY_LAST_LOG, value: JSON.stringify(next) });
      if (r.status === "sent") setSuccessMsg("تم إرسال تقرير الأمس بنجاح.");
      else if (r.status === "skipped") setSuccessMsg("لا توجد مبيعات أمس.");
      else setErrorMsg(`فشل: ${r.message}`);
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <section
      dir="rtl"
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-6 md:p-8 flex flex-col gap-5 shadow-xl"
      aria-labelledby="telegram-heading"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <h2
            id="telegram-heading"
            className="font-display text-xl md:text-2xl font-extrabold text-copper-400"
          >
            تقرير تيليجرام اليومي
          </h2>
          <p className="text-sm text-espresso-300 leading-7">
            كل يوم الساعة{" "}
            <span className="font-mono font-bold">6:00 صباحًا</span>، يرسل
            التطبيق تلقائيًا تقريرًا بملف CSV يحتوي على مبيعات اليوم السابق
            إلى محادثة تيليجرام خاصة بك عبر بوت.
          </p>
        </div>
        <button
          ref={helpTriggerRef}
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="فتح دليل إعداد بوت تيليجرام"
          aria-haspopup="dialog"
          aria-controls={TELEGRAM_GUIDE_DIALOG_ID}
          className="flex-shrink-0 min-h-[44px] px-3 md:px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 text-copper-300 font-bold border border-espresso-700 flex items-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-copper-500"
        >
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-copper-600 text-espresso-950 text-sm font-extrabold"
          >
            ؟
          </span>
          <span className="text-sm">دليل الإعداد</span>
        </button>
      </header>

      <ol className="text-sm text-espresso-200 leading-7 list-decimal pr-5 flex flex-col gap-2">
        <li>
          افتح تيليجرام وأرسل أي رسالة للبوت — هذا يفعّل المحادثة ويسمح
          باكتشاف معرّفها.
        </li>
        <li>
          اضغط <strong>اكتشاف المحادثة</strong> أدناه لحفظ معرّف المحادثة.
        </li>
        <li>
          اضغط <strong>إرسال رسالة اختبار</strong> للتأكد أن كل شيء يعمل.
        </li>
        <li>
          اضغط <strong>تشغيل الآن</strong> لمعاينة تقرير الأمس وإرساله فورًا.
        </li>
      </ol>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={detectChatId}
          disabled={disabled}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
        >
          {busy === "detect" ? "…" : "اكتشاف المحادثة"}
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={disabled || !chatId.trim()}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
        >
          {busy === "test" ? "جاري الإرسال…" : "إرسال رسالة اختبار"}
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={disabled || !chatId.trim()}
          className="min-h-[48px] px-5 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-espresso-50 font-bold border border-copper-700"
        >
          {busy === "run" ? "جاري التشغيل…" : "تشغيل الآن"}
        </button>
      </div>

      {successMsg && (
        <p
          role="status"
          className="text-sm text-copper-300 bg-copper-950/40 border border-copper-800 rounded-2xl px-4 py-3"
        >
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p
          role="alert"
          className="text-sm text-rust-200 bg-rust-950/40 border border-rust-800 rounded-2xl px-4 py-3"
        >
          {errorMsg}
        </p>
      )}

      <div className="border-t border-espresso-800 pt-4 flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-espresso-200">
          السجلّ الأخير
        </h3>
        {lastRun && (
          <p className="text-xs text-espresso-400 font-mono" dir="ltr">
            آخر تشغيل: {lastRun}
          </p>
        )}
        {log.length === 0 ? (
          <p className="text-xs text-espresso-500">لا يوجد سجل بعد.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {log.map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className={`px-3 py-2 rounded-xl font-mono leading-5 ${
                  entry.kind === "success"
                    ? "bg-copper-950/30 text-copper-200"
                    : entry.kind === "skipped"
                      ? "bg-espresso-950/50 text-espresso-300"
                      : "bg-rust-950/30 text-rust-200"
                }`}
                dir="ltr"
              >
                <span className="opacity-60">
                  {new Date(entry.at).toLocaleString("en-GB")}
                </span>
                {" — "}
                {entry.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <TelegramSetupGuide open={helpOpen} onClose={closeHelp} />
    </section>
  );
}
