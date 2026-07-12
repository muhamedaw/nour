"use client";

import { useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import {
  discoverChatId,
  runDailyReport,
  sendTextMessage,
  type ReportLog,
} from "@/lib/telegram/reporter";

const KEY_BOT_TOKEN = "tg.botToken";
const KEY_CHAT_ID = "tg.chatId";
const KEY_LAST_RUN = "tg.lastRunDate";
const KEY_LAST_LOG = "tg.lastLog";

type BusyKind = "detect" | "test" | "run" | null;

export default function TelegramSettings(): JSX.Element {
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [log, setLog] = useState<ReportLog[]>([]);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing config + log on mount.
  useEffect(() => {
    (async () => {
      const [t, c, lr, ll] = await Promise.all([
        Preferences.get({ key: KEY_BOT_TOKEN }),
        Preferences.get({ key: KEY_CHAT_ID }),
        Preferences.get({ key: KEY_LAST_RUN }),
        Preferences.get({ key: KEY_LAST_LOG }),
      ]);
      if (t.value) setBotToken(t.value);
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

  async function saveToken(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!botToken.trim()) {
      setErrorMsg("الرجاء إدخال توكن البوت.");
      return;
    }
    await Preferences.set({ key: KEY_BOT_TOKEN, value: botToken.trim() });
    setSuccessMsg("تم حفظ التوكن.");
  }

  async function detectChatId(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy("detect");
    try {
      const id = await discoverChatId(botToken.trim());
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

  async function saveChatId(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!chatId.trim()) {
      setErrorMsg("الرجاء إدخال معرّف المحادثة.");
      return;
    }
    await Preferences.set({ key: KEY_CHAT_ID, value: chatId.trim() });
    setSuccessMsg("تم حفظ المعرّف.");
  }

  async function sendTest(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy("test");
    try {
      const r = await sendTextMessage(
        { botToken: botToken.trim(), chatId: chatId.trim() },
        "اختبار من مقعى ترف — إذا وصلك هذا، فكل شيء يعمل بشكل سليم ✅",
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
    setBusy("run");
    try {
      const r = await runDailyReport({
        botToken: botToken.trim(),
        chatId: chatId.trim(),
      });
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      // Same semantics as DailyReporter.tryRun: lastRunDate = the day
      // the run was attempted (= today), and only persist on
      // sent/skipped so a failure here also surfaces a retry on the
      // next missed-run check.
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
      <header className="flex flex-col gap-2">
        <h2
          id="telegram-heading"
          className="font-display text-xl md:text-2xl font-extrabold text-copper-400"
        >
          تقرير تيليجرام اليومي
        </h2>
        <p className="text-sm text-espresso-300 leading-7">
          كل يوم الساعة <span className="font-mono font-bold">6:00 صباحًا</span>،
          يرسل التطبيق تلقائيًا تقريرًا بملف CSV يحتوي على مبيعات اليوم
          السابق إلى محادثة تيليجرام خاصة بك عبر بوت.
        </p>
      </header>

      <ol className="text-sm text-espresso-200 leading-7 list-decimal pr-5 flex flex-col gap-2">
        <li>
          في تيليجرام، ابحث عن{" "}
          <span className="font-mono text-copper-300">@BotFather</span>، أرسل{" "}
          <span className="font-mono">/newbot</span>، واتبع التعليمات. ستحصل
          على <span className="font-mono">توكن</span> (سلسلة طويلة من الأرقام
          والحروف).
        </li>
        <li>
          افتح المحادثة الجديدة مع البوت، وأرسل له أي رسالة (مثلاً «مرحبًا»)
          — هذا يفعّل البوت ويسمح لنا باكتشاف المحادثة.
        </li>
        <li>
          الصق التوكن في الحقل أدناه، ثم اضغط{" "}
          <strong>اكتشاف المحادثة</strong>. سيجد التطبيق معرّف المحادثة
          تلقائيًا.
        </li>
        <li>
          اضغط <strong>إرسال رسالة اختبار</strong> للتأكد أن كل شيء يعمل.
        </li>
        <li>
          اضغط <strong>تشغيل الآن</strong> لمعاينة تقرير الأمس وإرساله فورًا.
        </li>
      </ol>

      <div className="grid gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-espresso-200">توكن البوت</span>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:AAH-abc…"
              className="flex-1 min-h-[48px] px-4 rounded-2xl bg-espresso-950 border border-espresso-700 text-espresso-50 font-mono text-sm focus:outline-none focus:border-copper-500"
              dir="ltr"
            />
            <button
              type="button"
              onClick={saveToken}
              disabled={disabled}
              className="min-h-[48px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
            >
              حفظ
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-espresso-200">
            معرّف المحادثة (يُكتشف تلقائيًا)
          </span>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="—"
              className="flex-1 min-h-[48px] px-4 rounded-2xl bg-espresso-950 border border-espresso-700 text-espresso-50 font-mono text-sm focus:outline-none focus:border-copper-500"
              dir="ltr"
            />
            <button
              type="button"
              onClick={detectChatId}
              disabled={disabled || !botToken.trim()}
              className="min-h-[48px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
            >
              {busy === "detect" ? "…" : "اكتشاف"}
            </button>
            <button
              type="button"
              onClick={saveChatId}
              disabled={disabled || !chatId.trim()}
              className="min-h-[48px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
            >
              حفظ
            </button>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={sendTest}
          disabled={disabled || !botToken.trim() || !chatId.trim()}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
        >
          {busy === "test" ? "جاري الإرسال…" : "إرسال رسالة اختبار"}
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={disabled || !botToken.trim() || !chatId.trim()}
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
          السجل الأخير
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
    </section>
  );
}
