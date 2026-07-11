"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AREA_THEME } from "@/components/domain";
import type { AreaType } from "@/lib/types";

export interface FloorTableButtonProps {
  area: AreaType;
  tableNumber: number;
  busy: boolean;
  /** Optional customer label from `GroupSession.label`. */
  label?: string;
  /** Optional opened-at ISO for "منذ X د" badge on busy cells. */
  openedAt?: string;
}

/**
 * Touch-first table cell. Tablet sits 2-4m from staff, so we use heavy
 * contrast (red ring + filled bg when busy, neutral outline when free)
 * and a big tap target (~120px tall).
 *
 * Hydration-safe: elapsed "منذ …" comes from `Date.now()` which differs
 * on the server vs first client paint. We render "—" until mounted, then
 * tick every 30s — tables don't need second-level precision on the grid.
 */
export default function FloorTableButton({
  area,
  tableNumber,
  busy,
  label,
  openedAt,
}: FloorTableButtonProps) {
  const theme = AREA_THEME[area];
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const since =
    !busy || !openedAt || now === null ? null : openedSince(openedAt, now);

  return (
    <Link
      href={`/table/${area}-${tableNumber}`}
      aria-label={
        busy ? `طاولة ${tableNumber} مشغولة` : `طاولة ${tableNumber} فاضية`
      }
      className={[
        "group relative flex flex-col items-center justify-center",
        "min-h-[120px] rounded-3xl px-4 py-3",
        "transition-transform active:scale-[0.98] tap-highlight-transparent",
        "border-2 select-none",
        busy
          ? `${theme.accentBg} border-transparent ring-4 ring-red-500/70 text-white shadow-lg shadow-red-950/40`
          : `bg-neutral-900 ${theme.accent} border-neutral-700 hover:border-neutral-500 text-neutral-100`,
        theme.focusRing,
      ].join(" ")}
    >
      <span className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80">
        {busy && (
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse"
          />
        )}
        طاولة
      </span>
      <span className="font-mono font-black text-5xl md:text-6xl mt-1 leading-none">
        {tableNumber}
      </span>
      {busy ? (
        <span className="mt-2 text-sm font-medium opacity-90 line-clamp-1">
          {label?.trim() ? label : since ?? "—"}
        </span>
      ) : (
        <span className="mt-2 text-sm font-medium text-neutral-400">
          افتح جلسة
        </span>
      )}
    </Link>
  );
}

function openedSince(iso: string, nowMs: number): string {
  const opened = new Date(iso).getTime();
  if (Number.isNaN(opened)) return "—";
  const ms = Math.max(0, nowMs - opened);
  const min = Math.floor(ms / 60000);
  if (min < 60) return `منذ ${min} د`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `منذ ${h} س ${m.toString().padStart(2, "0")} د`;
}
