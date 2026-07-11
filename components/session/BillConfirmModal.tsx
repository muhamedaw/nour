"use client";

import { useEffect } from "react";
import { fmtSAR } from "@/components/domain";
import type { SessionItem } from "@/lib/types";
import type { BillBreakdown } from "./bill";

export interface BillConfirmModalProps {
  /** Localized area label (e.g. "سنوكر"). */
  areaLabel: string;
  tableNumber: number;
  /** `null` means product-only session (no time cost line). */
  hourlyRate: number | null;
  items: SessionItem[];
  breakdown: BillBreakdown;
  /** `true` while the close API call is in flight — disables Cancel / ESC. */
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
 * `ProductOnlySessionView`. Renders an itemized list (or empty-state
 * fallback), the time cost (only when there is an hourly rate), the
 * grand total, and two touch-first buttons (Cancel / Confirm & Close).
 *
 * Closes on ESC and on backdrop click — both disabled while a close is
 * in flight so the staff cannot bail mid-call.
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
  // ESC closes the modal — disabled mid-flight to avoid a half-cancelled
  // closeSessionRemote POST.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bill-confirm-title"
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-t-3xl md:rounded-3xl w-full md:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl shadow-black/60">
        <header className="px-6 py-5 border-b border-neutral-800 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-widest text-neutral-400">
            مراجعة الفاتورة قبل الإغلاق
          </div>
          <h2
            id="bill-confirm-title"
            className="text-2xl md:text-3xl font-extrabold"
          >
            <span>{areaLabel}</span>
            <span className="mx-2 text-neutral-500">·</span>
            <span>
              طاولة <span className="font-mono">{tableNumber}</span>
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            {customerLabel.trim() && (
              <span className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
                {customerLabel}
              </span>
            )}
            {hourlyRate !== null && (
              <>
                <span className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 font-mono">
                  {fmtSAR(hourlyRate)} / ساعة
                </span>
                <span className="px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700">
                  {breakdown.elapsedMinutes} دقيقة
                </span>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            hourlyRate !== null ? (
              <div className="bg-amber-600/10 border border-amber-600/40 rounded-2xl p-5 text-center">
                <p className="text-amber-300 text-lg font-bold mb-2">
                  لا توجد منتجات
                </p>
                <p className="text-neutral-300 text-sm">
                  سيتم احتساب الوقت فقط في الإجمالي.
                </p>
              </div>
            ) : (
              <p className="text-red-300 text-center py-8 text-lg">
                لا توجد منتجات على هذه الجلسة.
              </p>
            )
          ) : (
            <ul className="grid gap-2">
              {items.map((i) => (
                <li
                  key={i.productId}
                  className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3"
                >
                  <span className="font-mono text-neutral-400 w-12 text-center">
                    {i.qty}×
                  </span>
                  <span className="flex-1 px-3 font-medium">{i.name}</span>
                  <span className="font-mono tabular-nums text-neutral-100">
                    {fmtSAR(i.price * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hourlyRate !== null && (
            <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between text-base">
              <span className="text-neutral-300">
                تكلفة الوقت ({breakdown.elapsedMinutes} دقيقة)
              </span>
              <span className="font-mono tabular-nums text-neutral-100">
                {fmtSAR(breakdown.timeCost)}
              </span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 bg-red-600/15 border border-red-600/40 rounded-2xl p-4 text-red-200"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="px-6 py-5 border-t border-neutral-800 flex flex-wrap items-center gap-4 bg-neutral-950">
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-widest text-neutral-400">
              الإجمالي
            </div>
            <div className="font-mono font-black text-4xl md:text-5xl text-white tabular-nums">
              {fmtSAR(breakdown.total)}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[56px] px-6 rounded-2xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-neutral-200 text-lg font-bold border border-neutral-700"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-[64px] px-7 rounded-2xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-lg font-extrabold shadow-lg shadow-red-950/40"
          >
            {busy ? "جاري الإغلاق…" : "تأكيد وإغلاق"}
          </button>
        </footer>
      </div>
    </div>
  );
}
