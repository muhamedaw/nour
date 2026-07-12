"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AREA_THEME,
  fmtElapsed,
  fmtSAR,
} from "@/components/domain";
import { fetchHistory, fetchSessions } from "@/components/floor/api-client";
import AreaSettingsPanel from "@/components/dashboard/AreaSettingsPanel";
import {
  AREA_AR,
  AREAS_ORDER,
  avgDurationMs,
  fmtDuration,
  type AreaBuckets,
  type ProductAgg,
  revenueByArea,
  sumRevenue,
  topProducts,
  hourlyRevenue,
} from "@/components/dashboard/report-aggregations";
import type {
  AreaType,
  GroupSession,
} from "@/lib/types";

/* ------------------------------------------------------------------ *
 *  Date helpers — same conventions as HistoryList.
 * ------------------------------------------------------------------ */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/* Open-only buckets live here (dashboard-specific). The other
 * aggregations are shared via report-aggregations.ts so the printable
 * EndOfDayReport can reuse them. */
type OpenBuckets = Record<AreaType, GroupSession[]>;

function groupOpenByArea(arr: GroupSession[]): OpenBuckets {
  const out: OpenBuckets = {
    snooker: [],
    cards: [],
    playstation: [],
  };
  for (const s of arr) out[s.area].push(s);
  // Longest-running first (oldest openedAt).
  for (const k of AREAS_ORDER) {
    out[k].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }
  return out;
}

/** Arabic-Indic hour label for the bar chart. */
function hourLabel(h: number): string {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", { useGrouping: false })
    .format(h)
    .padStart(2, "0");
}

function timeAgo(ts: number): string {
  const elapsed = Date.now() - ts;
  if (elapsed < 5_000) return "الآن";
  if (elapsed < 60_000) return `قبل ${Math.floor(elapsed / 1000)} ثانية`;
  if (elapsed < 3_600_000)
    return `قبل ${Math.floor(elapsed / 60_000)} دقيقة`;
  return `قبل ${Math.floor(elapsed / 3_600_000)} ساعة`;
}

/* ------------------------------------------------------------------ *
 *  Component
 * ------------------------------------------------------------------ */
const POLL_MS = 30_000;
const TICK_MS = 1_000;

export default function DashboardView() {
  const [closed, setClosed] = useState<GroupSession[] | null>(null);
  const [open, setOpen] = useState<GroupSession[] | null>(null);
  const [liveError, setLiveError] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // `now` is null until the mount-effect runs so SSR markup doesn't bake
  // server-time into the OpenAreaColumn elapsed timers (avoids a hydration
  // mismatch when client time ≠ server time).
  const [now, setNow] = useState<number | null>(null);

  /* ------------- Data load + 30s polling ------------- */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      // Day window is intentionally the local-time calendar day, not a
      // rolling 24h window — the dashboard is "today at a glance" by
      // design and the spec says "today's total revenue". The boundary
      // is recomputed on every poll so a session that closes past
      // midnight appears in tomorrow's view.
      const from = startOfToday().toISOString();
      const to = endOfToday().toISOString();
      const [closedResp, openResp] = await Promise.all([
        fetchHistory({ from, to }),
        fetchSessions({ status: "open" }),
      ]);
      if (cancelled) return;
      const bothFailed = closedResp === null && openResp === null;
      setClosed(closedResp ?? []);
      setOpen(openResp ?? []);
      setLiveError(bothFailed);
      setLastUpdated(Date.now());
      setInitialLoad(false);
      if (!cancelled) timer = setTimeout(load, POLL_MS);
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* ------------- Mount once: seed `now` so SSR/CSR match ------------- */
  useEffect(() => {
    setNow(Date.now());
  }, []);

  /* ------------- Per-second tick for live elapsed timers ------------- */
  useEffect(() => {
    const count = open?.length ?? 0;
    if (count === 0) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [open?.length]);

  /* ------------- Memoized aggregations ------------- */
  const closedArr = closed ?? [];
  const openArr = open ?? [];
  const todayRevenue = useMemo(() => sumRevenue(closedArr), [closedArr]);
  const perArea = useMemo(() => revenueByArea(closedArr), [closedArr]);
  const avgMs = useMemo(() => avgDurationMs(closedArr), [closedArr]);
  const top = useMemo(() => topProducts(closedArr, 5), [closedArr]);
  const hourly = useMemo(() => hourlyRevenue(closedArr), [closedArr]);
  const groupedOpen = useMemo(() => groupOpenByArea(openArr), [openArr]);
  const hasAnyData =
    closedArr.length > 0 || openArr.length > 0;
  const totalOpenCount = openArr.length;

  /* ------------- Retry handler (used by global error banner) ------------- */
  const reload = async () => {
    setLiveError(false);
    const from = startOfToday().toISOString();
    const to = endOfToday().toISOString();
    const [closedResp, openResp] = await Promise.all([
      fetchHistory({ from, to }),
      fetchSessions({ status: "open" }),
    ]);
    setClosed(closedResp ?? []);
    setOpen(openResp ?? []);
    setLiveError(closedResp === null && openResp === null);
    setLastUpdated(Date.now());
    setInitialLoad(false);
  };

  /* ------------- Render ------------- */
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader lastUpdated={lastUpdated} initial={initialLoad} />

      <AreaSettingsPanel />

      {liveError && !hasAnyData ? (
        <ErrorBanner onRetry={reload} />
      ) : (
        <>
          <StatTiles
            revenue={todayRevenue}
            openCount={totalOpenCount}
            avgMs={avgMs}
            loading={initialLoad}
            isError={liveError}
          />

          <HourlyChart hours={hourly} loading={initialLoad} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopProductsCard items={top} loading={initialLoad} />
            <RevenueByAreaCard
              buckets={perArea}
              loading={initialLoad}
              totalOfBuckets={todayRevenue}
            />
          </div>

          <OpenNowCard
            buckets={groupedOpen}
            now={now}
            loading={initialLoad}
          />

          {/* Subtle error ribbon when stale data is shown but a poll failed. */}
          {liveError && hasAnyData && (
            <div
              role="status"
              dir="rtl"
              className="bg-rust-600/10 border border-rust-600/40 rounded-2xl px-4 py-3 text-rust-300 text-sm flex items-center justify-between gap-3"
            >
              <span>
                تعذّر تحديث البيانات الآن. تُعرض آخر قيمة ناجحة حتى إعادة
                المحاولة.
              </span>
              <button
                type="button"
                onClick={reload}
                className="px-3 py-2 rounded-xl bg-rust-600 hover:bg-rust-500 text-espresso-50 text-sm font-bold min-h-[40px] transition-colors duration-200"
              >
                إعادة المحاولة
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ====================================================================
 *  Sub-components
 * ==================================================================== */

function DashboardHeader({
  lastUpdated,
  initial,
}: {
  lastUpdated: number | null;
  initial: boolean;
}) {
  return (
    <header
      className="flex flex-wrap items-end justify-between gap-3"
      dir="rtl"
    >
      <div className="flex flex-col">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">
          لوحة التحكم
        </h1>
        <p className="text-espresso-300 mt-1 text-sm md:text-base">
          نظرة مباشرة على أداء اليوم.
        </p>
      </div>
      <div className="flex items-center gap-3 text-sm text-espresso-300">
        <Link
          href="/dashboard/report"
          className="px-4 py-2 rounded-xl border border-espresso-700 hover:border-espresso-400 hover:text-espresso-50 text-espresso-100 font-semibold min-h-[48px] inline-flex items-center transition-colors duration-200"
        >
          تقرير اليوم ←
        </Link>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={[
              "inline-block h-2 w-2 rounded-full",
              initial
                ? "bg-espresso-400 animate-pulse"
                : "bg-copper-500",
            ].join(" ")}
          />
          <span>
            {lastUpdated
              ? `آخر تحديث: ${timeAgo(lastUpdated)}`
              : "في انتظار أول قراءة…"}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatTiles({
  revenue,
  openCount,
  avgMs,
  loading,
  isError,
}: {
  revenue: number;
  openCount: number;
  avgMs: number;
  loading: boolean;
  isError: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
      <Tile
        label="إيرادات اليوم"
        loading={loading}
        value={
          <span className="font-mono font-black tabular-nums text-4xl md:text-5xl">
            {fmtSAR(revenue)}
          </span>
        }
        sub="مجموع كل الجلسات المغلقة اليوم"
        tone="emerald"
        dim={isError}
      />
      <Tile
        label="جلسات مفتوحة الآن"
        loading={loading}
        value={
          <span className="font-mono font-black tabular-nums text-4xl md:text-5xl">
            {openCount.toLocaleString("ar-SA-u-nu-latn")}
          </span>
        }
        sub={
          openCount === 0
            ? "كل الطاولات فارغة."
            : "موزعة على المناطق أدناه"
        }
        tone={openCount > 0 ? "red" : "neutral"}
        dim={isError}
      />
      <Tile
        label="متوسط مدة الجلسة (اليوم)"
        loading={loading}
        value={
          <span className="font-mono font-black tabular-nums text-4xl md:text-5xl">
            {avgMs === 0 ? "—" : fmtDuration(avgMs)}
          </span>
        }
        sub="من الجلسات المغلقة اليوم"
        tone="blue"
        dim={isError}
      />
    </div>
  );
}

type TileProps = {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: "emerald" | "red" | "blue" | "neutral";
  loading: boolean;
  dim: boolean;
};

function Tile({ label, value, sub, tone, loading, dim }: TileProps) {
  const toneClasses =
    tone === "emerald"
      ? "border-copper-600/30"
      : tone === "red"
        ? "border-rust-600/30"
        : tone === "blue"
          ? "border-copper-600/30"
          : "border-espresso-800";
  return (
    <div
      dir="rtl"
      className={[
        "rounded-3xl border bg-espresso-900 p-5 md:p-6 flex flex-col gap-2 transition-opacity",
        toneClasses,
        dim ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="text-sm uppercase tracking-widest text-espresso-300">
        {label}
      </div>
      <div className="min-h-[3.5rem] flex items-center">
        {loading ? <Bar className="h-10 w-3/4" /> : value}
      </div>
      <div className="text-sm text-espresso-400">{sub}</div>
    </div>
  );
}

/* Lightweight shimmering placeholder. */
function Bar({ className }: { className?: string }) {
  return (
    <div
      className={[
        "rounded-md bg-espresso-800 animate-pulse",
        className ?? "",
      ].join(" ")}
      aria-hidden
    />
  );
}

function ErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      dir="rtl"
      className="bg-rust-600/10 border border-rust-600/40 rounded-3xl p-6 md:p-8 text-center"
    >
      <p className="text-rust-300 text-lg md:text-xl mb-3">
        تعذّر تحميل لوحة التحكم.
      </p>
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

/* ----------------------------- Hourly chart ----------------------------- */

function HourlyChart({
  hours,
  loading,
}: {
  hours: number[];
  loading: boolean;
}) {
  const max = Math.max(1, ...hours);
  const totalToday = hours.reduce((s, v) => s + v, 0);
  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-xl md:text-2xl font-bold">
            الإيرادات حسب الساعة
          </h2>
          <p className="text-sm text-espresso-300 mt-1">
            مبيعات اليوم موزعة على ساعات اليوم.
          </p>
        </div>
        <div className="text-sm text-espresso-300">
          مجموع اليوم:{" "}
          <span className="font-mono font-bold text-espresso-50 tabular-nums">
            {fmtSAR(totalToday)}
          </span>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-12 gap-1 md:gap-2 h-40">
          {Array.from({ length: 12 }).map((_, i) => (
            <Bar key={i} className="h-full" />
          ))}
        </div>
      ) : totalToday === 0 ? (
        <p className="text-espresso-400 text-center py-12">
          لا توجد مبيعات اليوم بعد.
        </p>
      ) : (
        <div className="grid grid-cols-12 md:grid-cols-24 gap-1 md:gap-2 items-end h-40 md:h-48">
          {hours.map((v, h) => {
            const pct = Math.max(0, Math.min(100, (v / max) * 100));
            const tallEnough = pct >= 4;
            return (
              <div
                key={h}
                className="flex flex-col items-center justify-end h-full"
                title={`${hourLabel(h)}:00 — ${fmtSAR(v)}`}
              >
                <div
                  className={[
                    "w-full rounded-t-md transition-all",
                    pct === 0
                      ? "bg-espresso-800/60"
                      : "bg-copper-600/80",
                  ].join(" ")}
                  style={{ height: `${pct}%` }}
                  aria-hidden
                />
                <div
                  className={[
                    "mt-1 text-[10px] md:text-xs font-mono tabular-nums",
                    tallEnough || v > 0 ? "text-espresso-200" : "text-espresso-600",
                  ].join(" ")}
                >
                  {hourLabel(h)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Top products ----------------------------- */

function TopProductsCard({
  items,
  loading,
}: {
  items: ProductAgg[];
  loading: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.qty));
  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="font-display text-xl md:text-2xl font-bold">أكثر المنتجات مبيعًا</h2>
        <p className="text-sm text-espresso-300">أعلى 5 اليوم</p>
      </header>

      {loading ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i}>
              <Bar className="h-9" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="text-espresso-400 text-center py-12">
          لا توجد مبيعات اليوم بعد.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((it, idx) => {
            const pct = Math.max(2, Math.round((it.qty / max) * 100));
            return (
              <li
                key={it.productId}
                className="flex items-center gap-3"
              >
                <span className="w-6 text-center font-mono text-espresso-300 tabular-nums">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="font-semibold truncate">{it.name}</span>
                    <span className="font-mono tabular-nums text-espresso-200">
                      {it.qty.toLocaleString("ar-SA-u-nu-latn")}×
                    </span>
                  </div>
                  <div className="h-2 bg-espresso-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-copper-600"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </div>
                </div>
                <span className="font-mono font-bold tabular-nums text-sm md:text-base text-espresso-300 w-20 text-left shrink-0">
                  {fmtSAR(it.revenue)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ----------------------------- Revenue by area ----------------------------- */

function RevenueByAreaCard({
  buckets,
  totalOfBuckets,
  loading,
}: {
  buckets: AreaBuckets;
  totalOfBuckets: number;
  loading: boolean;
}) {
  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="font-display text-xl md:text-2xl font-bold">الإيرادات حسب المنطقة</h2>
        <p className="text-sm text-espresso-300">اليوم</p>
      </header>

      {loading ? (
        <ul className="flex flex-col gap-3">
          {AREAS_ORDER.map((a) => (
            <li key={a}>
              <Bar className="h-12" />
            </li>
          ))}
        </ul>
      ) : totalOfBuckets === 0 ? (
        <p className="text-espresso-400 text-center py-12">
          لا توجد مبيعات اليوم بعد.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {AREAS_ORDER.map((a) => {
            const v = buckets[a] ?? 0;
            const pct =
              totalOfBuckets > 0
                ? Math.max(2, Math.round((v / totalOfBuckets) * 100))
                : 0;
            const theme = AREA_THEME[a];
            return (
              <li key={a}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={[theme.accentBg, "w-2 h-6 rounded-full"].join(
                        " ",
                      )}
                      aria-hidden
                    />
                    <span className="font-semibold">{AREA_AR[a]}</span>
                  </div>
                  <span className="font-mono font-bold tabular-nums">
                    {fmtSAR(v)}
                  </span>
                </div>
                <div className="h-3 bg-espresso-800 rounded-full overflow-hidden">
                  <div
                    className={["h-full", theme.accentBg].join(" ")}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ----------------------------- Open now ----------------------------- */

function OpenNowCard({
  buckets,
  now,
  loading,
}: {
  buckets: OpenBuckets;
  /** Null until the parent's mount-once effect sets `Date.now()`. */
  now: number | null;
  loading: boolean;
}) {
  const total = buckets.snooker.length + buckets.cards.length + buckets.playstation.length;
  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <h2 className="font-display text-xl md:text-2xl font-bold">جلسات مفتوحة الآن</h2>
        <p className="text-sm text-espresso-300">
          المجموع:{" "}
          <span className="font-mono font-bold text-espresso-50 tabular-nums">
            {total.toLocaleString("ar-SA-u-nu-latn")}
          </span>
        </p>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AREAS_ORDER.map((a) => (
            <div key={a} className="rounded-2xl border border-espresso-800 p-4">
              <Bar className="h-6 w-24 mb-3" />
              <Bar className="h-9" />
              <Bar className="h-9 mt-2" />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <p className="text-espresso-400 text-center py-12">
          لا توجد جلسات مفتوحة الآن.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AREAS_ORDER.map((a) => (
            <OpenAreaColumn
              key={a}
              area={a}
              sessions={buckets[a] ?? []}
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OpenAreaColumn({
  area,
  sessions,
  now,
}: {
  area: AreaType;
  sessions: GroupSession[];
  /** Null until the parent's mount-once effect sets `Date.now()`. */
  now: number | null;
}) {
  const theme = AREA_THEME[area];
  return (
    <div className="rounded-2xl border border-espresso-800 p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <span className={[theme.accentBg, "w-2 h-6 rounded-full"].join(" ")} aria-hidden />
        <h3 className="font-display font-bold text-lg">{AREA_AR[area]}</h3>
        <span
          className={[
            "px-2 py-1 rounded-full text-xs font-semibold border mr-auto",
            theme.badge,
          ].join(" ")}
        >
          {sessions.length.toLocaleString("ar-SA-u-nu-latn")}
        </span>
      </header>
      {sessions.length === 0 ? (
        <p className="text-espresso-400 text-sm py-3">فارغ</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => {
            // `now` is null until client-mount settles; render a placeholder
            // for one frame so SSR markup doesn't disagree with hydration.
            const elapsedMs =
              now === null ? null : now - new Date(s.openedAt).getTime();
            return (
              <li
                key={s.id}
                className="rounded-xl bg-espresso-950/60 border border-espresso-800 px-3 py-2 flex items-center gap-3"
              >
                <span className="font-mono font-bold tabular-nums text-lg shrink-0">
                  {s.tableNumber}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-espresso-200">
                  {s.label && s.label.trim().length > 0
                    ? s.label
                    : "بدون اسم"}
                </span>
                <span
                  className="font-mono tabular-nums text-copper-400 shrink-0 tabular-nums w-20 text-left"
                  title={new Date(s.openedAt).toLocaleString("ar-SA-u-nu-latn")}
                >
                  {elapsedMs === null ? "—" : fmtElapsed(elapsedMs)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

