"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
 * Touch-first table cell. Tablet sits 2-4m from staff, so busy/free must
 * read instantly: BUSY is a solid rust fill (occupied, alert), FREE is a
 * quiet neutral surface that lights up copper on hover/focus (available,
 * inviting a tap). One semantic pair, no per-area color competing with it.
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
        "min-h-[76px] sm:min-h-[100px] md:min-h-[120px] rounded-2xl sm:rounded-3xl px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3",
        "transition-all duration-200 ease-out active:scale-[0.97] tap-highlight-transparent",
        "border-2 select-none focus-visible:ring-4 focus-visible:ring-copper-400/70",
        busy
          ? "bg-rust-600 border-rust-500 ring-4 ring-rust-400/40 text-espresso-50 shadow-warm"
          : "bg-espresso-900 border-espresso-700 hover:border-copper-500 hover:bg-espresso-800 text-espresso-50",
      ].join(" ")}
    >
      <span className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs uppercase tracking-widest opacity-80">
        {busy && (
          <span
            aria-hidden
            className="inline-block w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-espresso-50 animate-pulse"
          />
        )}
        طاولة
      </span>
      <span className="font-mono font-black text-2xl sm:text-4xl md:text-5xl lg:text-6xl mt-1 leading-none">
        {tableNumber}
      </span>
      {busy ? (
        <span className="mt-1 sm:mt-2 text-[10px] sm:text-sm font-medium opacity-90 line-clamp-1">
          {label?.trim() ? label : since ?? "—"}
        </span>
      ) : (
        <span className="mt-1 sm:mt-2 text-[10px] sm:text-sm font-semibold text-copper-400 group-hover:text-copper-300 transition-colors duration-200">
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
