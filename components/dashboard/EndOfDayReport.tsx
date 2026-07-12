"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AREA_AR,
  AREAS_ORDER,
  fmtDuration,
  type AreaBuckets,
  type ProductAgg,
} from "@/components/dashboard/report-aggregations";
import { buildReportText } from "@/components/dashboard/report-text";
import { fetchHistory } from "@/components/floor/api-client";
import type { GroupSession } from "@/lib/types";

type ShareState = "idle" | "copied" | "error";
type LoadState = "loading" | "ok" | "error";

/* ====================================================================
 *  Date helpers
 * ==================================================================== */

/** Today as yyyy-mm-dd in the user's local timezone. */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** {from, to} ISO bounds for a given yyyy-mm-dd day. */
function dayBounds(dateStr: string): { from: string; to: string } {
  const start = new Date(`${dateStr}T00:00:00`);
  // Inclusive of end-of-day microseconds. toISOString() loses the
  // sub-millisecond precision but the API filter is "from <= closedAt < to"
  // so the +1 day is structurally correct even if narrower on paper.
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(-1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Pretty Arabic label for the chosen date. */
function fmtDateAr(d: Date): { full: string; weekday: string } {
  const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const weekdayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { weekday: "long" });
  return { full: dateFmt.format(d), weekday: weekdayFmt.format(d) };
}

function fmtDateLong(d: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fmtClock(d: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/* ====================================================================
 *  Component
 * ==================================================================== */
export default function EndOfDayReport() {
  // Both `dateStr` and the DatePicker `max` depend on `todayISO()`, which
  // reads `Date()` — values can disagree between server pre-render and
  // client hydration (timezone, midnight boundary). We seed from "" on SSR
  // and bump `mounted`; the actual today + the picker render after mount.
  const [dateStr, setDateStr] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<GroupSession[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  // Bumped on retry so the load effect runs even if dateStr is unchanged.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const t = todayISO();
    setDateStr((prev) => (prev ? prev : t));
    setMounted(true);
  }, []);

  /* ------------- Fetch on date change (or retry) ------------- */
  useEffect(() => {
    // Guard against the user clearing the native date input; without this
    // dayBounds("") → new Date("T00:00:00") is Invalid Date → toISOString()
    // throws inside the .then(). We treat empty/malformed as "no refresh".
    const probe = new Date(`${dateStr}T00:00:00`);
    if (!Number.isFinite(probe.getTime())) {
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    const { from, to } = dayBounds(dateStr);
    fetchHistory({ from, to }).then((list) => {
      if (cancelled) return;
      if (list === null) {
        setSessions([]);
        setLoadState("error");
      } else {
        setSessions(list);
        setLoadState("ok");
        setGeneratedAt(new Date());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dateStr, refreshTick]);

  const reload = () => setRefreshTick((n) => n + 1);

  /* ------------- Memoized text block for share + preview ------------- */
  const reportDate = useMemo(() => {
    const safe = new Date(`${dateStr}T00:00:00`);
    return Number.isFinite(safe.getTime()) ? safe : new Date();
  }, [dateStr]);
  const sessionsArr = sessions ?? [];
  const built = useMemo(
    () => buildReportText({ date: reportDate, sessions: sessionsArr }),
    [reportDate, sessionsArr],
  );

  /* ------------- Share button handler ------------- */
  async function handleShare() {
    if (loadState !== "ok") return;
    try {
      // navigator.clipboard requires secure context (https or localhost).
      // Older browsers / insecure preview deploys will reject here.
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(built.text);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[share] clipboard failed", err);
      }
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 3000);
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Controls — hidden on print */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">
          تقرير نهاية اليوم
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker value={dateStr} onChange={setDateStr} hidden={!mounted} />
          <ShareButton state={shareState} onClick={handleShare} disabled={loadState !== "ok"} />
          <PrintButton onClick={handlePrint} disabled={loadState !== "ok"} />
        </div>
      </div>

      {/* The print area — visible on screen and on paper. */}
      <article className="print-area flex flex-col gap-5 max-w-3xl w-full">
        <ReportHeader
          date={reportDate}
          loading={loadState === "loading"}
          error={loadState === "error"}
          generatedAt={generatedAt}
        />

        {loadState === "loading" ? (
          <ReportSkeleton />
        ) : loadState === "error" ? (
          <ReportError onRetry={reload} />
        ) : (
          <ReportBody
            totalRevenue={built.totalRevenue}
            perArea={built.perArea}
            sessionCount={built.sessionCount}
            avgMs={built.avgMs}
            top={built.top}
          />
        )}

        {/* Share preview — on screen only, never prints. */}
        {loadState === "ok" && (
          <details className="no-print rounded-2xl border border-espresso-800 bg-espresso-900 p-4 md:p-5">
            <summary className="cursor-pointer text-sm font-semibold text-espresso-200 select-none">
              معاينة نص المشاركة
            </summary>
            <pre
              dir="rtl"
              className="mt-3 text-sm leading-7 whitespace-pre-wrap font-mono text-espresso-50"
            >
              {built.text}
            </pre>
          </details>
        )}
      </article>

      {/* Quick link back to the live dashboard. */}
      <div className="no-print">
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 rounded-xl border border-espresso-800 hover:border-espresso-600 text-espresso-200 hover:text-espresso-50 transition min-h-[48px] font-semibold"
        >
          ← العودة إلى لوحة التحكم
        </Link>
      </div>
    </div>
  );
}

/* ====================================================================
 *  Sub-components
 * ==================================================================== */

function DatePicker({
  value,
  onChange,
  hidden,
}: {
  value: string;
  onChange: (v: string) => void;
  /** When true, render an inert skeleton row so SSR matches hydration. */
  hidden?: boolean;
}) {
  // Native <input type="date"> — gives free locale-correct keyboard support,
  // min/max validation, and is rtl-friendly without extra plumbing.
  return (
    <label className="inline-flex items-center gap-2 text-sm text-espresso-200 bg-espresso-900 border border-espresso-800 rounded-xl px-3 py-2 min-h-[48px]">
      <span className="text-espresso-300">التاريخ:</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        max={hidden ? undefined : todayISO()}
        disabled={hidden}
        className={[
          "bg-transparent text-espresso-50 outline-none border-none focus:outline-none tabular-nums",
          hidden ? "opacity-0 pointer-events-none w-0 p-0 m-0" : "",
        ].join(" ")}
        aria-label="اختر التاريخ"
      />
    </label>
  );
}

function PrintButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-5 py-3 rounded-xl bg-white text-espresso-900 hover:bg-espresso-100 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] transition-colors duration-200"
    >
      طباعة
    </button>
  );
}

function ShareButton({
  state,
  onClick,
  disabled,
}: {
  state: ShareState;
  onClick: () => void;
  disabled: boolean;
}) {
  const label =
    state === "copied"
      ? "✓ تم النسخ"
      : state === "error"
        ? "تعذّر النسخ — حاول مرة أخرى"
        : "نسخ كـ نص";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-live="polite"
      className={[
        "px-5 py-3 rounded-xl font-bold text-sm min-h-[48px] transition",
        state === "copied"
          ? "bg-copper-600 text-espresso-50"
          : state === "error"
            ? "bg-rust-600 text-espresso-50"
            : "bg-espresso-800 hover:bg-espresso-700 text-espresso-50 border border-espresso-700",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function ReportHeader({
  date,
  loading,
  error,
  generatedAt,
}: {
  date: Date;
  loading: boolean;
  error: boolean;
  generatedAt: Date | null;
}) {
  const { full, weekday } = fmtDateAr(date);
  return (
    <header className="flex flex-col gap-2 pb-4 border-b border-espresso-800">
      <div className="text-xs uppercase tracking-widest text-espresso-400">
        تقرير نهاية اليوم
      </div>
      <h2 className="font-display text-2xl md:text-4xl font-extrabold print:text-3xl">
        {full}
      </h2>
      <p className="text-espresso-300 text-sm md:text-base">{weekday}</p>
      <div className="text-xs text-espresso-400 mt-1 no-print">
        {loading
          ? "جارٍ التحميل…"
          : error
            ? "تعذّر الجلب — الأرقام قد تكون غير مكتملة."
            : generatedAt
              ? `أُنشئ في ${fmtDateLong(generatedAt)} — ${fmtClock(generatedAt)}`
              : ""}
      </div>
    </header>
  );
}

function ReportBody({
  totalRevenue,
  perArea,
  sessionCount,
  avgMs,
  top,
}: {
  totalRevenue: number;
  perArea: AreaBuckets;
  sessionCount: number;
  avgMs: number;
  top: ProductAgg[];
}) {
  const total = totalRevenue;
  const isEmpty = sessionCount === 0;

  return (
    <>
      {/* Big number — total revenue (or the no-sales message). */}
      <section
        dir="rtl"
        className="rounded-3xl border border-espresso-800 bg-espresso-900 p-6 md:p-8 flex flex-col gap-2 print:bg-white print:border-black"
      >
        <div className="text-sm uppercase tracking-widest text-espresso-300 print:text-black">
          إجمالي المبيعات
        </div>
        <div className="font-mono font-black tabular-nums text-4xl md:text-6xl print:text-5xl">
          {isEmpty ? "—" : fmtSARInline(total)}
        </div>
        <div className="text-sm text-espresso-400 print:text-espresso-700">
          {isEmpty
            ? "لم تُسجّل أي مبيعات في هذا اليوم."
            : `${sessionCount.toLocaleString("ar-SA-u-nu-latn")} جلسة مغلقة خلال اليوم`}
        </div>
      </section>

      {!isEmpty && (
        <>
          {/* By-area split */}
          <section
            dir="rtl"
            className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6 print:bg-white print:border-black"
          >
            <h3 className="font-display text-lg md:text-xl font-bold mb-3 print:text-2xl">
              الإيرادات حسب المنطقة
            </h3>
            <ul className="flex flex-col gap-2">
              {AREAS_ORDER.map((a) => {
                const v = perArea[a] ?? 0;
                const pct = total > 0 ? Math.max(2, Math.round((v / total) * 100)) : 0;
                return (
                  <li
                    key={a}
                    className="grid grid-cols-[1fr_auto] gap-3 items-baseline"
                  >
                    <span className="font-semibold">{AREA_AR[a]}</span>
                    <span className="font-mono font-bold tabular-nums">
                      {fmtSARInline(v)}
                    </span>
                    <div
                      className="col-span-2 h-2 bg-espresso-800 rounded-full overflow-hidden print:bg-espresso-100"
                      aria-hidden
                    >
                      <div
                        className="h-full bg-copper-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Sessions count + avg duration row */}
          <section
            dir="rtl"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6 print:bg-white print:border-black">
              <div className="text-sm uppercase tracking-widest text-espresso-300 print:text-black">
                عدد الجلسات
              </div>
              <div className="font-mono font-black tabular-nums text-3xl md:text-4xl print:text-3xl">
                {sessionCount.toLocaleString("ar-SA-u-nu-latn")}
              </div>
            </div>
            <div className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6 print:bg-white print:border-black">
              <div className="text-sm uppercase tracking-widest text-espresso-300 print:text-black">
                متوسط مدة الجلسة
              </div>
              <div className="font-mono font-black tabular-nums text-3xl md:text-4xl print:text-3xl">
                {avgMs === 0 ? "—" : fmtDuration(avgMs)}
              </div>
            </div>
          </section>

          {/* Top products */}
          <section
            dir="rtl"
            className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6 print:bg-white print:border-black"
          >
            <h3 className="font-display text-lg md:text-xl font-bold mb-3 print:text-2xl">
              أكثر المنتجات مبيعًا
            </h3>
            {top.length === 0 ? (
              <p className="text-espresso-400">لم تُسجّل أي منتجات.</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {top.map((it, idx) => (
                  <li
                    key={it.productId}
                    className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3"
                  >
                    <span className="font-mono text-espresso-300 tabular-nums w-6 text-center print:text-black">
                      {idx + 1}
                    </span>
                    <span className="font-semibold truncate">{it.name}</span>
                    <span className="font-mono tabular-nums text-espresso-100 print:text-black">
                      {it.qty.toLocaleString("ar-SA-u-nu-latn")}×
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </>
  );
}

function ReportSkeleton() {
  return (
    <div
      dir="rtl"
      className="flex flex-col gap-4"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-3xl border border-espresso-800 bg-espresso-900 p-6 md:p-8">
        <div className="h-4 w-40 rounded bg-espresso-800 animate-pulse mb-3" />
        <div className="h-12 w-3/4 rounded bg-espresso-800 animate-pulse" />
        <div className="h-3 w-40 rounded bg-espresso-800 animate-pulse mt-3" />
      </div>
      <div className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6">
        <div className="h-5 w-64 rounded bg-espresso-800 animate-pulse mb-3" />
        <div className="h-9 rounded bg-espresso-800 animate-pulse" />
        <div className="h-9 rounded bg-espresso-800 animate-pulse mt-2" />
        <div className="h-9 rounded bg-espresso-800 animate-pulse mt-2" />
      </div>
    </div>
  );
}

function ReportError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      dir="rtl"
      className="rounded-3xl border border-rust-600/40 bg-rust-600/10 p-6 md:p-8 text-center no-print"
      role="status"
    >
      <p className="text-rust-300 text-lg mb-3">تعذّر تحميل تقرير هذا اليوم.</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-6 py-3 rounded-2xl bg-rust-600 hover:bg-rust-500 text-espresso-50 font-bold min-h-[48px] transition-colors duration-200"
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

/**
 * Money formatter for the print body. Mirrors domain.fmtSAR but cuts the
 * Intl currency boilerplate when we only need the numeric surface — the
 * prefix "ر.س" is implied by the report context, so we leave it out.
 */
const SAR_NUM = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function fmtSARInline(n: number): string {
  return `${SAR_NUM.format(Number.isFinite(n) ? n : 0)} ر.س`;
}
