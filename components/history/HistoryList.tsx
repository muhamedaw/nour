"use client";

import { useEffect, useMemo, useState } from "react";
import { AREA_THEME, fmtSAR } from "@/components/domain";
import { fetchHistory, type HistoryArgs } from "@/components/floor/api-client";
import type { AreaType, GroupSession } from "@/lib/types";

type AreaFilter = AreaType | "all";
type DateFilter = "today" | "yesterday" | "all";

/* ------------------------------------------------------------------ *
 *  Date helpers — translated into ISO bounds the API can filter on.
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
function startOfYesterday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
}
function endOfYesterday(): Date {
  const d = startOfYesterday();
  d.setHours(23, 59, 59, 999);
  return d;
}

function argsForDate(
  filter: DateFilter,
): Pick<HistoryArgs, "from" | "to"> {
  if (filter === "today") {
    return { from: startOfToday().toISOString(), to: endOfToday().toISOString() };
  }
  if (filter === "yesterday") {
    return {
      from: startOfYesterday().toISOString(),
      to: endOfYesterday().toISOString(),
    };
  }
  return {};
}

/**
 * Expandable list of closed sessions.
 *  • Top: area chips + date chips filter row.
 *  • Each row taps to expand into a bill breakdown (line items + total).
 */
export default function HistoryList() {
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [openId, setOpenId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const args: HistoryArgs = { area: areaFilter, ...argsForDate(dateFilter) };
    fetchHistory(args).then((list) => {
      if (cancelled) return;
      if (list === null) {
        setLoadError(true);
        setSessions([]);
      } else {
        setSessions(list);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [areaFilter, dateFilter]);

  const filtered = useMemo(
    () => sessions.filter((s) => s.status === "closed"),
    [sessions],
  );

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    const args: HistoryArgs = { area: areaFilter, ...argsForDate(dateFilter) };
    fetchHistory(args).then((list) => {
      if (list === null) {
        setLoadError(true);
      } else {
        setSessions(list);
      }
      setLoading(false);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <FilterRow
        areaFilter={areaFilter}
        dateFilter={dateFilter}
        onArea={setAreaFilter}
        onDate={setDateFilter}
      />

      {loadError ? (
        <div
          className="bg-red-600/10 border border-red-600/40 rounded-3xl p-6 text-center"
          role="status"
          dir="rtl"
        >
          <p className="text-red-300 text-lg mb-3">تعذّر تحميل الفواتير.</p>
          <button
            type="button"
            onClick={reload}
            className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold min-h-[48px]"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : loading ? (
        <p className="text-neutral-500 text-center py-16 text-lg animate-pulse">
          جارٍ التحميل…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500 text-center py-16 text-lg">
          لا توجد فواتير مطابقة.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((s) => {
            const open = openId === s.id;
            const theme = AREA_THEME[s.area];
            const items = s.items ?? [];
            return (
              <li
                key={s.id}
                className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : s.id)}
                  aria-expanded={open}
                  className="w-full text-right p-4 md:p-5 flex flex-wrap items-center gap-4 hover:bg-neutral-800/60 transition"
                  dir="rtl"
                >
                  <span
                    className={["w-2 h-12 rounded-full", theme.accentBg].join(" ")}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-bold">
                      طاولة <span className="font-mono">{s.tableNumber}</span>
                    </div>
                    <div className="text-sm text-neutral-400 mt-1">
                      {s.closedAt
                        ? new Date(s.closedAt).toLocaleString("ar-SA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </div>
                  </div>
                  {s.label && (
                    <span className="text-sm text-neutral-300">{s.label}</span>
                  )}
                  <span className="font-mono font-black text-2xl tabular-nums text-white">
                    {fmtSAR(s.billedTotal ?? 0)}
                  </span>
                  <span
                    className={[
                      "px-3 py-2 rounded-xl border text-sm font-semibold",
                      theme.badge,
                    ].join(" ")}
                  >
                    {open ? "إخفاء" : "تفاصيل"}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-neutral-800 p-4 md:p-5 bg-neutral-950/60">
                    <h4 className="text-sm uppercase tracking-widest text-neutral-400 mb-3">
                      بنود الفاتورة
                    </h4>
                    {items.length === 0 ? (
                      <p className="text-neutral-500">
                        بدون منتجات على هذه الجلسة.
                      </p>
                    ) : (
                      <ul className="grid gap-1">
                        {items.map((i) => (
                          <li
                            key={i.productId}
                            className="flex items-center justify-between text-base"
                          >
                            <span className="font-mono text-neutral-400 w-10 text-center">
                              {i.qty}×
                            </span>
                            <span className="flex-1 px-3">{i.name}</span>
                            <span className="font-mono tabular-nums">
                              {fmtSAR(i.price * i.qty)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between text-base">
                      <span className="text-neutral-400">الإجمالي</span>
                      <span className="font-mono font-black text-xl text-white">
                        {fmtSAR(s.billedTotal ?? 0)}
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FilterRow({
  areaFilter,
  dateFilter,
  onArea,
  onDate,
}: {
  areaFilter: AreaFilter;
  dateFilter: DateFilter;
  onArea: (a: AreaFilter) => void;
  onDate: (d: DateFilter) => void;
}) {
  const areas: { value: AreaFilter; label: string }[] = [
    { value: "all", label: "الكل" },
    { value: "snooker", label: "سنوكر" },
    { value: "cards", label: "كوتشينة" },
    { value: "playstation", label: "بلايستيشن" },
  ];
  const dates: { value: DateFilter; label: string }[] = [
    { value: "today", label: "اليوم" },
    { value: "yesterday", label: "أمس" },
    { value: "all", label: "كل الأيام" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap" dir="rtl">
        {areas.map((a) => (
          <Chip
            key={a.value}
            active={areaFilter === a.value}
            label={a.label}
            onClick={() => onArea(a.value)}
          />
        ))}
      </div>
      <div className="flex gap-2 flex-wrap" dir="rtl">
        {dates.map((d) => (
          <Chip
            key={d.value}
            active={dateFilter === d.value}
            label={d.label}
            onClick={() => onDate(d.value)}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-5 py-3 rounded-full text-sm font-semibold border-2 min-h-[48px]",
        active
          ? "bg-white text-neutral-900 border-white"
          : "bg-neutral-900 text-neutral-200 border-neutral-700 hover:border-neutral-500",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
