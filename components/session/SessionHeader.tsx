"use client";

import Link from "next/link";
import { AREA_THEME, fmtElapsed, fmtSAR } from "@/components/domain";
import { getAreaConfig } from "@/lib/config";
import type { AreaType } from "@/lib/types";

export interface SessionHeaderProps {
  area: AreaType;
  tableNumber: number;
  hourlyRate: number | null;
  /** ms since opened, or null if not yet mounted (hydration safety). */
  elapsedMs: number | null;
  labelValue: string;
  onLabelChange: (next: string) => void;
}

/**
 * Top of a session view.
 *  • Area badge + table number.
 *  • Huge mm:ss clock with a pulsing red dot when the area has a rate.
 *  • Customer name field with focus-visible ring.
 *  • Back-to-floor link.
 */
export default function SessionHeader({
  area,
  tableNumber,
  hourlyRate,
  elapsedMs,
  labelValue,
  onLabelChange,
}: SessionHeaderProps) {
  const cfg = getAreaConfig(area);
  const theme = AREA_THEME[area];
  const showClock = hourlyRate !== null;

  return (
    <header
      className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_auto] md:items-start md:gap-6"
      dir="rtl"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/"
            className="text-neutral-400 hover:text-white transition px-3 py-2 rounded-xl border border-neutral-800 hover:border-neutral-600"
          >
            ← رجوع للأرضية
          </Link>
          <span
            className={[
              "px-3 py-1 rounded-full text-sm font-semibold border",
              theme.badge,
            ].join(" ")}
          >
            {cfg.label}
          </span>
          <span className="text-2xl md:text-3xl font-extrabold">
            طاولة <span className="font-mono">{tableNumber}</span>
          </span>
          {hourlyRate !== null && (
            <span className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-sm text-neutral-300 font-mono">
              {fmtSAR(hourlyRate)} / ساعة
            </span>
          )}
        </div>

        {showClock && (
          <div className="flex items-center gap-4 bg-neutral-950 border border-neutral-800 rounded-3xl px-5 py-4 w-fit">
            <span
              aria-hidden
              className="inline-block w-3 h-3 rounded-full bg-red-500 animate-pulse"
            />
            <span
              className="font-mono font-black text-5xl md:text-7xl tabular-nums text-white"
              aria-live="off"
            >
              {elapsedMs === null ? "--:--" : fmtElapsed(elapsedMs)}
            </span>
          </div>
        )}

        <label className="flex flex-col gap-1 max-w-md">
          <span className="text-xs uppercase tracking-widest text-neutral-400">
            اسم العميل (اختياري)
          </span>
          <input
            value={labelValue}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="مثال: أبو عبدالله"
            className="bg-neutral-900 border border-neutral-700 rounded-2xl px-4 py-3 text-lg focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>
    </header>
  );
}
