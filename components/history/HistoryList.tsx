"use client";

import { useEffect, useMemo, useState } from "react";
import { AREA_THEME, fmtSAR } from "@/components/domain";
import { fetchHistory, type HistoryArgs } from "@/components/floor/api-client";
import type { AreaType, GroupSession } from "@/lib/types";

type AreaFilter = AreaType | "all";
type DateFilter = "today" | "yesterday" | "all" | "custom";

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
/** yyyy-mm-dd (local time) → start/end of that calendar day. */
function startOfDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}
function endOfDate(dateStr: string): Date {
  const d = startOfDate(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}
/** Today as yyyy-mm-dd (local time) — used as the date-picker's `max`. */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function argsForDate(
  filter: DateFilter,
  customDate: string,
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
  if (filter === "custom" && customDate) {
    return { from: startOfDate(customDate).toISOString(), to: endOfDate(customDate).toISOString() };
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
  const [customDate, setCustomDate] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [labelInput, setLabelInput] = useState("");
  const [labelFilter, setLabelFilter] = useState("");

  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Debounce label input → labelFilter (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setLabelFilter(labelInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [labelInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const args: HistoryArgs = {
      area: areaFilter,
      ...argsForDate(dateFilter, customDate),
      label: labelFilter || undefined,
    };
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
  }, [areaFilter, dateFilter, customDate, labelFilter]);

  const filtered = useMemo(
    () => sessions.filter((s) => s.status === "closed"),
    [sessions],
  );

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    const args: HistoryArgs = {
      area: areaFilter,
      ...argsForDate(dateFilter, customDate),
      label: labelFilter || undefined,
    };
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
        customDate={customDate}
        labelInput={labelInput}
        onArea={setAreaFilter}
        onDate={setDateFilter}
        onCustomDate={(v) => {
          setCustomDate(v);
          setDateFilter("custom");
        }}
        onLabelInput={setLabelInput}
      />

      {loadError ? (
        <div
          className="bg-rust-600/10 border border-rust-600/40 rounded-3xl p-6 text-center"
          role="status"
          dir="rtl"
        >
          <p className="text-rust-300 text-lg mb-3">تعذّر تحميل الفواتير.</p>
          <button
            type="button"
            onClick={reload}
            className="px-5 py-3 rounded-2xl bg-rust-600 hover:bg-rust-500 text-espresso-50 font-bold min-h-[48px] transition-colors duration-200"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : loading ? (
        <p className="text-espresso-400 text-center py-16 text-lg animate-pulse">
          جارٍ التحميل…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-espresso-400 text-center py-16 text-lg">
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
                className="bg-espresso-900 border border-espresso-800 rounded-3xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : s.id)}
                  aria-expanded={open}
                  className="w-full text-right p-4 md:p-5 flex flex-wrap items-center gap-4 hover:bg-espresso-800/60 transition"
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
                    <div className="text-sm text-espresso-300 mt-1">
                      {s.closedAt
                        ? new Date(s.closedAt).toLocaleString("ar-SA-u-nu-latn", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </div>
                  </div>
                  {s.label && (
                    <span className="text-sm text-espresso-200">{s.label}</span>
                  )}
                  <span className="font-mono font-black text-2xl tabular-nums text-espresso-50">
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
                  <div className="border-t border-espresso-800 p-4 md:p-5 bg-espresso-950/60">
                    <h4 className="text-sm uppercase tracking-widest text-espresso-300 mb-3">
                      بنود الفاتورة
                    </h4>
                    {items.length === 0 ? (
                      <p className="text-espresso-400">
                        بدون منتجات على هذه الجلسة.
                      </p>
                    ) : (
                      <ul className="grid gap-1">
                        {items.map((i) => (
                          <li
                            key={i.productId}
                            className="flex items-center justify-between text-base"
                          >
                            <span className="font-mono text-espresso-300 w-10 text-center">
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
                    <div className="mt-4 pt-3 border-t border-espresso-800 flex items-center justify-between text-base">
                      <span className="text-espresso-300">الإجمالي</span>
                      <span className="font-mono font-black text-xl text-espresso-50">
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
  customDate,
  labelInput,
  onArea,
  onDate,
  onCustomDate,
  onLabelInput,
}: {
  areaFilter: AreaFilter;
  dateFilter: DateFilter;
  customDate: string;
  labelInput: string;
  onArea: (a: AreaFilter) => void;
  onDate: (d: DateFilter) => void;
  onCustomDate: (v: string) => void;
  onLabelInput: (v: string) => void;
}) {
  const areas: { value: AreaFilter; label: string }[] = [
    { value: "all", label: "الكل" },
    { value: "snooker", label: "سنوكر" },
    { value: "cards", label: "Cards" },
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
      <div className="flex gap-2 flex-wrap items-center" dir="rtl">
        {dates.map((d) => (
          <Chip
            key={d.value}
            active={dateFilter === d.value}
            label={d.label}
            onClick={() => onDate(d.value)}
          />
        ))}
        <input
          type="date"
          value={customDate}
          max={todayISO()}
          onChange={(e) => onCustomDate(e.target.value)}
          aria-label="اختر يومًا محددًا"
          className={[
            "px-4 py-3 rounded-full text-sm border-2 min-h-[48px] focus:outline-none",
            dateFilter === "custom"
              ? "bg-white text-espresso-900 border-white"
              : "bg-espresso-900 text-espresso-100 border-espresso-700 hover:border-espresso-400",
          ].join(" ")}
        />
      </div>
      <div dir="rtl">
        <input
          type="text"
          value={labelInput}
          onChange={(e) => onLabelInput(e.target.value)}
          placeholder="ابحث باسم الزبون"
          className="w-full max-w-sm px-5 py-3 rounded-full text-sm border-2 border-espresso-700 bg-espresso-900 text-espresso-100 placeholder-espresso-400 focus:outline-none focus:border-white min-h-[48px]"
        />
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
          ? "bg-white text-espresso-900 border-white"
          : "bg-espresso-900 text-espresso-100 border-espresso-700 hover:border-espresso-400",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
