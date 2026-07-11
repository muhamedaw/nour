"use client";

import { fmtSAR } from "@/components/domain";
import type { BillBreakdown } from "./bill";

export interface BillSummaryBarProps {
  breakdown: BillBreakdown;
  itemsCount: number;
  showTimeCost: boolean;
  onClose: () => void;
  busy?: boolean;
}

/**
 * Bottom-pinned total bar shared by both session views.
 *  • Items count and product total (left side).
 *  • Final total on the right with a huge "إغلاق وحساب الفاتورة" CTA.
 */
export default function BillSummaryBar({
  breakdown,
  itemsCount,
  showTimeCost,
  onClose,
  busy,
}: BillSummaryBarProps) {
  return (
    <footer
      className="fixed inset-x-0 bottom-0 z-30 px-4 md:px-6 pb-4 pt-3 bg-gradient-to-t from-neutral-950 via-neutral-950/95 to-transparent"
      dir="rtl"
    >
      <div className="mx-auto max-w-7xl rounded-3xl bg-neutral-900 border border-neutral-800 shadow-2xl shadow-black/40 p-4 md:p-5 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 flex-1">
          <Stat label="عناصر" value={`${itemsCount}`} />
          <Stat
            label="منتجات"
            value={fmtSAR(breakdown.productsTotal)}
            mono
          />
          {showTimeCost && (
            <Stat
              label={`وقت (${breakdown.elapsedMinutes} د)`}
              value={fmtSAR(breakdown.timeCost)}
              mono
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-left">
            <div className="text-xs uppercase tracking-widest text-neutral-400">
              إجمالي
            </div>
            <div className="font-mono font-black text-3xl md:text-4xl text-white tabular-nums">
              {fmtSAR(breakdown.total)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[64px] px-6 md:px-8 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-lg md:text-xl font-extrabold tracking-tight shadow-lg shadow-red-950/40 transition active:scale-[0.98]"
          >
            إغلاق وحساب الفاتورة
          </button>
        </div>
      </div>
    </footer>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div
        className={[
          "text-xl md:text-2xl font-bold",
          mono ? "font-mono tabular-nums" : "",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
