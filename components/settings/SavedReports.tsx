"use client";

/**
 * SavedReports — lists every daily report the app has persisted to
 * local storage (Documents/reports/), each with share + delete
 * actions. Independent of whether the Telegram send succeeded — a
 * "failed to Telegram" report still shows up here and can be
 * re-shared manually.
 *
 * The local save is the durable audit trail; Telegram is best-effort
 * delivery. This view is the user's way to access the audit trail
 * from inside the app (they can also pull the files via USB from
 * the Android Documents folder).
 */

import { useEffect, useState } from "react";
import {
  deleteSavedReport,
  listSavedReports,
  shareSavedReport,
  type SavedReport,
} from "@/lib/telegram/report-storage";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}

function formatArabicDate(yyyyMmDd: string): string {
  // yyyy-mm-dd → dd/mm/yyyy — purely cosmetic for the UI; the
  // underlying date string is still YYYY-MM-DD in the filename.
  const parts = yyyyMmDd.split("-");
  if (parts.length !== 3) return yyyyMmDd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function SavedReports(): JSX.Element {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [busy, setBusy] = useState<null | string>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh(): Promise<void> {
    setLoading(true);
    const list = await listSavedReports();
    setReports(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleShare(date: string): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(date);
    try {
      const r = await shareSavedReport(date);
      if (!r.ok) {
        setErrorMsg(r.error ?? "تعذّرت المشاركة.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(date: string): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(date);
    try {
      const ok = await deleteSavedReport(date);
      if (ok) {
        setSuccessMsg("تم حذف التقرير.");
        // Refresh the list without a loading flicker.
        const list = await listSavedReports();
        setReports(list);
      } else {
        setErrorMsg("تعذّر حذف التقرير.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      dir="rtl"
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-6 md:p-8 flex flex-col gap-5 shadow-xl"
      aria-labelledby="saved-reports-heading"
    >
      <header className="flex flex-col gap-2">
        <h2
          id="saved-reports-heading"
          className="font-display text-xl md:text-2xl font-extrabold text-copper-400"
        >
          التقارير المحفوظة
        </h2>
        <p className="text-sm text-espresso-300 leading-7">
          نسخة محلية دائمة من كل تقرير يومي. حتى لو فشل الإرسال إلى
          تيليجرام، يبقى التقرير محفوظًا هنا ويمكنك مشاركته يدويًا أو
          نسخه عبر USB إلى الحاسوب. الملفات في مجلد{" "}
          <span className="font-mono text-copper-300" dir="ltr">
            Documents/reports/
          </span>
          .
        </p>
      </header>

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

      {loading ? (
        <p className="text-sm text-espresso-400">جاري التحميل…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-espresso-500">
          لا توجد تقارير محفوظة بعد. سيظهر تقرير هنا تلقائيًا بعد
          أول تشغيل عند الساعة 6:00 صباحًا (أو بعد الضغط على «تشغيل
          الآن» في إعدادات تيليجرام).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.map((r) => {
            const isBusy = busy === r.date;
            const m = r.metadata;
            return (
              <li
                key={r.date}
                className="bg-espresso-950/60 border border-espresso-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-mono font-bold text-espresso-50"
                      dir="ltr"
                    >
                      {formatArabicDate(r.date)}
                    </span>
                    {m && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                          m.telegramSent
                            ? "bg-copper-950/40 text-copper-300 border border-copper-800"
                            : "bg-rust-950/40 text-rust-200 border border-rust-800"
                        }`}
                      >
                        {m.telegramSent
                          ? "✓ Telegram"
                          : "✗ Telegram (محلي فقط)"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-espresso-400 mt-1 flex flex-wrap gap-x-3 gap-y-1" dir="ltr">
                    <span>{formatBytes(r.size)}</span>
                    {m && (
                      <>
                        <span>·</span>
                        <span>{m.sessionCount} جلسة</span>
                        <span>·</span>
                        <span>₪{m.totalRevenue.toFixed(2)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleShare(r.date)}
                    disabled={isBusy}
                    className="min-h-[44px] px-4 rounded-xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
                  >
                    {isBusy ? "…" : "مشاركة"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.date)}
                    disabled={isBusy}
                    className="min-h-[44px] px-4 rounded-xl bg-espresso-800 hover:bg-rust-900/60 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
                  >
                    حذف
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
