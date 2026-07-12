"use client";

import Link from "next/link";
import { AREA_ICON, AREA_THEME, fmtElapsed, fmtSAR } from "@/components/domain";
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
 *  • Huge mm:ss clock with a pulsing rust dot when the area has a rate —
 *    the single most-glanced-at element on this screen, so it gets the
 *    heaviest visual weight and its own copper-lit card.
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
            className="text-espresso-300 hover:text-espresso-50 transition-colors duration-200 px-3 py-2 rounded-xl border border-espresso-800 hover:border-copper-600"
          >
            ← رجوع للأرضية
          </Link>
          <span
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border",
              theme.badge,
            ].join(" ")}
          >
            <span aria-hidden>{AREA_ICON[area]}</span>
            {cfg.label}
          </span>
          <span className="font-display text-2xl md:text-3xl font-extrabold text-espresso-50">
            طاولة <span className="font-mono">{tableNumber}</span>
          </span>
          {hourlyRate !== null && (
            <span className="px-3 py-1 rounded-full bg-espresso-800 border border-espresso-700 text-sm text-espresso-200 font-mono">
              {fmtSAR(hourlyRate)} / ساعة
            </span>
          )}
        </div>

        {showClock && (
          <div className="flex items-center gap-4 bg-espresso-950 border border-copper-800/60 rounded-3xl px-5 py-4 w-fit shadow-warm">
            <span
              aria-hidden
              className="inline-block w-3 h-3 rounded-full bg-rust-500 animate-pulse"
            />
            <span
              className="font-mono font-black text-5xl md:text-7xl tabular-nums text-espresso-50"
              aria-live="off"
            >
              {elapsedMs === null ? "--:--" : fmtElapsed(elapsedMs)}
            </span>
          </div>
        )}

        <label className="flex flex-col gap-1 max-w-md">
          <span className="text-xs uppercase tracking-widest text-espresso-300">
            اسم العميل (اختياري)
          </span>
          <input
            value={labelValue}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="مثال: أبو عبدالله"
            className="bg-espresso-900 border border-espresso-700 rounded-2xl px-4 py-3 text-lg transition-colors duration-200 focus:border-copper-500 focus:outline-none"
          />
        </label>
      </div>
    </header>
  );
}
