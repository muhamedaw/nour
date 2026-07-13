"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * Rendered through a React Portal into `document.body` so it lives outside
 * `.app-shell`'s `transform: scale(var(--app-scale))` context (any CSS
 * transform on an ancestor creates a new containing block for `position:
 * fixed` descendants, pinning the bar to the scaled box bottom instead of
 * to the real viewport).  Once outside, the same `--app-scale` is applied
 * directly on the portaled root with `transform-origin: bottom center` so
 * the bar still matches the visual sizing of everything else and stays
 * glued to the bottom edge of the screen (not the top of the page).
 *
 * SSR/hydration: `document.body` only exists after mount, so the first
 * render returns `null` (server + first client render agree) and the
 * portal is created after a mount `useEffect`.  No flash because the
 * parent `TimedSessionView` / `ProductOnlySessionView` are client
 * components that don't paint their first frame until after hydration
 * completes anyway.
 */
export default function BillSummaryBar({
  breakdown,
  itemsCount,
  showTimeCost,
  onClose,
  busy,
}: BillSummaryBarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <footer
      className="fixed inset-x-0 bottom-0 z-30 px-4 md:px-6 pb-4 pt-3 bg-gradient-to-t from-espresso-950 via-espresso-950/95 to-transparent"
      dir="rtl"
      style={{
        // Re-apply the phone-fit scale that .app-shell normally provides.
        // Reading the same CSS variable keeps the bar visually consistent
        // with the rest of the UI without hardcoding any breakpoint.
        transform: "scale(var(--app-scale))",
        transformOrigin: "bottom center",
      }}
    >
      <div className="mx-auto max-w-7xl rounded-3xl bg-espresso-900 border border-espresso-800 shadow-2xl shadow-black/40 p-4 md:p-5 flex flex-wrap items-center gap-4">
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
            <div className="text-xs uppercase tracking-widest text-espresso-300">
              إجمالي
            </div>
            <div className="font-mono font-black text-3xl md:text-4xl text-espresso-50 tabular-nums">
              {fmtSAR(breakdown.total)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[64px] px-6 md:px-8 rounded-2xl bg-rust-600 hover:bg-rust-500 disabled:opacity-60 text-espresso-50 text-lg md:text-xl font-extrabold tracking-tight shadow-lg shadow-rust-950/40 transition active:scale-[0.98]"
          >
            إغلاق وحساب الفاتورة
          </button>
        </div>
      </div>
    </footer>,
    document.body,
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
      <div className="text-xs uppercase tracking-widest text-espresso-300">
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
