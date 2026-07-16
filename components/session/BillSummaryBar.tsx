"use client";

import { useEffect, useRef, useState } from "react";
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
 * Rendered through a React Portal into `document.body` so it sits as a
 * direct child of the document root (escapes any ancestor stacking/
 * transform context that would otherwise capture `position: fixed`).
 *
 * The footer's real rendered height is written to `--bill-bar-h` on
 * `document.documentElement` via a ResizeObserver below.  Session views
 * reserve exactly that much bottom padding (with a static `10rem`
 * fallback matching the previous `pb-40` while the first measurement is
 * pending), so the last product row is always visible above the bar
 * regardless of how many stat pills wrap.
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
  const footerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * Publish the footer's actual height to a CSS custom property so the
   * session views can pad under it exactly.  ResizeObserver fires on
   * mount (initial size) and every time content wraps to a different
   * line count.
   *
   * Always re-reads `el.offsetHeight` (the border-box, including the
   * footer's own `pt-3 pb-4` padding) rather than the observer entry's
   * `contentRect.height` (content-box only, excludes padding/border) —
   * mixing the two meant every post-mount update under-reported the
   * height by exactly the vertical padding, letting the bar creep over
   * the last product row by that same amount.
   */
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty("--bill-bar-h", `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--bill-bar-h");
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <footer
      ref={footerRef}
      className="fixed inset-x-0 bottom-0 z-30 px-4 md:px-6 pb-4 pt-3 bg-gradient-to-t from-espresso-950 via-espresso-950/95 to-transparent"
      dir="rtl"
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="text-left">
            <div className="text-xs uppercase tracking-widest text-espresso-300">
              إجمالي
            </div>
            <div className="font-mono font-black text-4xl sm:text-5xl md:text-6xl text-espresso-50 tabular-nums whitespace-nowrap">
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
