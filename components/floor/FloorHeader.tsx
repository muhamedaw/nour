"use client";

import Link from "next/link";
import { AREA_THEME, fmtSAR } from "@/components/domain";
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
        className="px-3 py-1 rounded-full text-sm font-semibold border bg-neutral-800 text-neutral-300 border-neutral-700 animate-pulse"
        dir="rtl"
      >
        تحميل…
      </span>
    );
  }
  return (
    <span
      className="px-3 py-1 rounded-full text-sm font-semibold border bg-red-600/15 text-red-300 border-red-600/40"
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
          className="text-neutral-400 hover:text-white transition px-3 py-2 rounded-xl border border-neutral-800 hover:border-neutral-600"
        >
          ← رجوع للأرضية
        </Link>
        <span
          aria-hidden
          className={[
            "inline-block w-3 h-12 rounded-full ring-2",
            theme.accent,
            theme.accentBg,
          ].join(" ")}
        />
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
          {display}
        </h2>
        <span
          className={[
            "px-3 py-1 rounded-full text-sm font-semibold border",
            busy
              ? "bg-red-600/15 text-red-300 border-red-600/40"
              : "bg-neutral-800 text-neutral-300 border-neutral-700",
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
