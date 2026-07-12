"use client";

import Link from "next/link";
import { AREA_ICON, AREA_THEME, fmtSAR } from "@/components/domain";
import type { AreaType } from "@/lib/types";

export interface FloorHeaderProps {
  area: AreaType;
  openCount: number;
  tableCount: number;
  hourlyRate: number | null;
  /** Localized area label, defaults to `area` if omitted. */
  areaLabel?: string;
  /** Background fetch status — drives a small chip on the right. */
  loadStatus?: "loading" | "ok" | "error";
}

/** Network chip rendered on the right side of the flood header. */
function StatusChip({ status }: { status: "loading" | "ok" | "error" }) {
  if (status === "ok") return null;
  if (status === "loading") {
    return (
      <span
        className="px-3 py-1 rounded-full text-sm font-semibold border bg-espresso-800 text-espresso-200 border-espresso-700 animate-pulse"
        dir="rtl"
      >
        تحميل…
      </span>
    );
  }
  return (
    <span
      className="px-3 py-1 rounded-full text-sm font-semibold border bg-rust-600/15 text-rust-300 border-rust-600/40"
      dir="rtl"
      role="status"
      aria-live="polite"
    >
      غير متصل — إعادة المحاولة
    </span>
  );
}

/**
 * Top bar of a floor screen.
 *  • Big Arabic area name + a small home link.
 *  • Live `openSessions / tableCount` counter with strong contrast.
 *  • Hourly rate (or "منتجات فقط") pill.
 */
export default function FloorHeader({
  area,
  openCount,
  tableCount,
  hourlyRate,
  areaLabel,
  loadStatus,
}: FloorHeaderProps) {
  const theme = AREA_THEME[area];
  const display = areaLabel ?? area;
  const busy = openCount > 0;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 mb-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/"
          className="text-espresso-300 hover:text-espresso-50 transition-colors duration-200 px-3 py-2 rounded-xl border border-espresso-800 hover:border-copper-600"
        >
          ← رجوع للأرضية
        </Link>
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-espresso-800 border border-espresso-700 text-2xl"
        >
          {AREA_ICON[area]}
        </span>
        <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-espresso-50">
          {display}
        </h2>
        <span
          className={[
            "px-3 py-1 rounded-full text-sm font-semibold border",
            busy
              ? "bg-rust-600/15 text-rust-300 border-rust-600/40"
              : "bg-espresso-800 text-espresso-200 border-espresso-700",
          ].join(" ")}
          dir="rtl"
        >
          {openCount} / {tableCount} مشغول
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={["px-4 py-2 rounded-full text-sm font-semibold border", theme.badge].join(" ")}
        >
          {hourlyRate === null ? "منتجات فقط" : `${fmtSAR(hourlyRate)} / ساعة`}
        </span>
        {loadStatus && <StatusChip status={loadStatus} />}
      </div>
    </header>
  );
}
