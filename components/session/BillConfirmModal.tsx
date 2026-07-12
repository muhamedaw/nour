"use client";

import { useEffect, useRef } from "react";
import { fmtSAR } from "@/components/domain";
import type { SessionItem } from "@/lib/types";
import type { BillBreakdown } from "./bill";

/**
 * Selector for querySelectorAll'ing focusable elements inside the modal.
 * Excludes disabled controls and tabindex=-1 escape hatches.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface BillConfirmModalProps {
  /** Localized area label (e.g. "سنوكر"). */
  areaLabel: string;
  tableNumber: number;
  /** `null` means product-only session (no time cost line). */
  hourlyRate: number | null;
  items: SessionItem[];
  breakdown: BillBreakdown;
  /** `true` while the close API call is in flight — disables Confirm / ESC. */
  busy: boolean;
  /** Inline error banner in the modal body when the close attempt failed. */
  errorMessage: string | null;
  /** Customer label, displayed as a chip; "" / untrimmed = no chip. */
  customerLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Review-before-close modal shared by `TimedSessionView` and
 * `ProductOnlySessionView`.
 *
 * A11y behaviors:
 *  • Tab/Shift+Tab cycle only within the modal — focus cannot escape to the
 *    page underneath (picker, floor tiles, etc.). When the close is mid-
 *    flight both buttons are disabled; the trap short-circuits with
 *    preventDefault so focus stays put instead of bleeding.
 *  • On open: focus moves to the Cancel button (the first focusable).
 *  • On close (any path, including unmount while busy): focus is restored
 *    to whatever element had focus before the modal opened — usually the
 *    session-view's "Close & Bill" button.
 *  • Body scroll is locked for the lifetime of the modal and restored on
 *    unmount, including the unmount-while-busy case.
 */
export default function BillConfirmModal({
  areaLabel,
  tableNumber,
  hourlyRate,
  items,
  breakdown,
  busy,
  errorMessage,
  customerLabel,
  onCancel,
  onConfirm,
}: BillConfirmModalProps) {
  // Scoped to the inner card so the focus cycler doesn't reach back into
  // any other focusable element rendered behind the (otherwise)
  // transparent overlay.
  const modalRef = useRef<HTMLDivElement | null>(null);

  /**
   * Mount / unmount lifecycle:
   *  • Capture the opener element so we can restore focus on unmount.
   *  • Lock `document.body` scroll for as long as the modal is mounted.
   *  • Move focus to the first focusable element inside the modal — the
   *    Cancel button on first open. `preventScroll: true` so the page
   *    underneath doesn't jump.
   */
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first focusable element synchronously after commit —
    // `useEffect` runs after React has painted the modal so the ref is
    // already populated. Synchronous (no queueMicrotask) keeps the call
    // tiny and avoids a visible frame where escapers could grab focus.
    const first = modalRef.current?.querySelector<HTMLElement>(
      FOCUSABLE_SELECTOR,
    );
    first?.focus({ preventScroll: true });

    return () => {
      // ALWAYS restore body scroll, even if unmount fires mid-busy
      // (e.g. the route changes after a successful close).
      document.body.style.overflow = prevOverflow;
      // Best-effort focus restore. If the opener is gone (route-change
      // unmount cascaded) this is a no-op.
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        // openedElement might be detached mid-unmount; ignore.
      }
    };
  }, []);

  /**
   * Focus trap. Always active — even while busy — because the only
   * point of the trap is to keep focus contained, not to cycle
   * somewhere productive. When both Confirm and Cancel are disabled
   * mid-close (`focusable.length === 0`) we preventDefault so the
   * browser doesn't advance focus to an element behind the modal.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = modalRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const activeEl = document.activeElement;

      if (focusable.length === 0) {
        // Mid-close: no enabled focusables. Don't let Tab bleed outside.
        e.preventDefault();
        (activeEl as HTMLElement | null)?.focus?.({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  /** ESC closes — gated by `!busy` so a half-cancelled close can't happen. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bill-confirm-title"
      dir="rtl"
      className="fixed inset-0 z-50 bg-espresso-950/85 flex items-end md:items-center justify-center p-0 md:p-4 print:bg-transparent animate-reveal-up motion-reduce:animate-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={modalRef}
        className="bg-espresso-900 border border-copper-800/50 rounded-t-3xl md:rounded-3xl w-full md:max-w-2xl max-h-[92vh] flex flex-col shadow-warm print:bg-white print:border-black print:text-black print-area animate-reveal-scale motion-reduce:animate-none"
      >
        <header className="px-6 py-5 border-b border-espresso-800 flex flex-col gap-2 no-print">
          <div className="text-xs uppercase tracking-widest text-espresso-300">
            مراجعة الفاتورة قبل الإغلاق
          </div>
          <h2
            id="bill-confirm-title"
            className="font-display text-2xl md:text-3xl font-extrabold"
          >
            <span>{areaLabel}</span>
            <span className="mx-2 text-espresso-400">·</span>
            <span>
              طاولة <span className="font-mono">{tableNumber}</span>
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-espresso-200">
            {customerLabel.trim() && (
              <span className="px-3 py-1 rounded-full bg-espresso-800 border border-espresso-700">
                {customerLabel}
              </span>
            )}
            {hourlyRate !== null && (
              <>
                <span className="px-3 py-1 rounded-full bg-espresso-800 border border-espresso-700 font-mono">
                  {fmtSAR(hourlyRate)} / ساعة
                </span>
                <span className="px-3 py-1 rounded-full bg-espresso-800 border border-espresso-700">
                  {breakdown.elapsedMinutes} دقيقة
                </span>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Print-only receipt header — hidden on screen, visible on paper */}
          <div className="hidden print:block text-center mb-6 pb-3 border-b print:border-black">
            <div className="text-xs uppercase tracking-widest text-espresso-300 print:text-espresso-600">
              فاتورة
            </div>
            <h2 className="font-display text-xl font-bold mt-1">
              {customerLabel.trim() || `طاولة رقم ${tableNumber}`}
            </h2>
            <p className="text-sm text-espresso-400">{areaLabel}</p>
          </div>
          {items.length === 0 ? (
            hourlyRate !== null ? (
              <div className="bg-copper-500/10 border border-copper-500/40 rounded-2xl p-5 text-center print:bg-white print:border-black">
                <p className="text-copper-300 text-lg font-bold mb-2 print:text-black">
                  لا توجد منتجات
                </p>
                <p className="text-espresso-200 text-sm print:text-black">
                  سيتم احتساب الوقت فقط في الإجمالي.
                </p>
              </div>
            ) : (
              <p className="text-rust-300 text-center py-8 text-lg print:text-black">
                لا توجد منتجات على هذه الجلسة.
              </p>
            )
          ) : (
            <ul className="grid gap-2">
              {items.map((i) => (
                <li
                  key={i.productId}
                  className="flex items-center justify-between bg-espresso-950 border border-espresso-800 rounded-2xl px-4 py-3 print:bg-white print:border-black"
                >
                  <span className="font-mono text-espresso-300 w-12 text-center print:text-black">
                    {i.qty}×
                  </span>
                  <span className="flex-1 px-3 font-medium print:text-black">{i.name}</span>
                  <span className="font-mono tabular-nums text-espresso-50 print:text-black">
                    {fmtSAR(i.price * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hourlyRate !== null && (
            <div className="mt-6 pt-4 border-t border-espresso-800 flex items-center justify-between text-base print:border-black">
              <span className="text-espresso-200 print:text-black">
                تكلفة الوقت ({breakdown.elapsedMinutes} دقيقة)
              </span>
              <span className="font-mono tabular-nums text-espresso-50 print:text-black">
                {fmtSAR(breakdown.timeCost)}
              </span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 bg-rust-600/15 border border-rust-600/40 rounded-2xl p-4 text-rust-200 no-print"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="px-6 py-5 border-t border-espresso-800 flex flex-wrap items-center gap-4 bg-espresso-950 print:bg-white print:border-black">
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-espresso-300 print:text-black">
              الإجمالي
            </div>
            <div className="font-mono font-black text-4xl md:text-5xl text-copper-300 tabular-nums print:text-black">
              {fmtSAR(breakdown.total)}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="no-print min-h-[56px] px-6 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-60 text-espresso-100 text-lg font-bold border border-espresso-700 transition-colors duration-200"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="no-print min-h-[56px] px-5 rounded-2xl bg-espresso-50 hover:bg-espresso-100 text-espresso-900 text-lg font-bold transition-colors duration-200"
          >
            طباعة
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="no-print min-h-[64px] px-7 rounded-2xl bg-rust-600 hover:bg-rust-500 disabled:opacity-60 text-espresso-50 text-lg font-extrabold shadow-warm transition-colors duration-200 active:scale-[0.98]"
          >
            {busy ? "جاري الإغلاق…" : "تأكيد وإغلاق"}
          </button>
        </footer>
      </div>
    </div>
  );
}
