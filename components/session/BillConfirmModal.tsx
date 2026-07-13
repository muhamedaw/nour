"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtSAR } from "@/components/domain";
import { computeSplit, type BillBreakdown } from "./bill";
import type { SessionItem } from "@/lib/types";

/**
 * Selector for querySelectorAll'ing focusable elements inside the modal.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DEFAULT_SPLIT_COUNT = 1;
const MAX_SPLIT_COUNT = 24;

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
  /** Current session players (from the parent's PlayersInput). */
  players: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Review-before-close modal shared by `TimedSessionView` and
 * `ProductOnlySessionView`.
 *
 * A11y behaviors:
 *  • Tab/Shift+Tab cycle only within the modal — focus cannot escape to the
 *    page underneath. When the close is mid-flight both Confirm buttons
 *    are disabled; the trap short-circuits with preventDefault so focus
 *    stays put instead of bleeding.
 *  • On open: focus moves to the Cancel button (the first focusable).
 *  • On close (any path, including unmount while busy): focus is restored
 *    to whatever element had focus before the modal opened.
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
  players,
  onCancel,
  onConfirm,
}: BillConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  /* ---------------- Split-by-N state ----------------
   * Default seed = players.length || 1 so an un-edited modal still
   * shows the natural split. Editing is non-committal — the modal only
   * floors via computeSplit, never mutates items or items.assignedPlayer. */
  const [splitCount, setSplitCount] = useState<number>(
    Math.max(1, players.length || DEFAULT_SPLIT_COUNT),
  );

  // Re-seed when the parent opens the modal for a different session.
  useEffect(() => {
    setSplitCount(Math.max(1, players.length || DEFAULT_SPLIT_COUNT));
  }, [players.length]);

  const split = useMemo(
    () => computeSplit(breakdown, items, splitCount, players),
    [breakdown, items, splitCount, players],
  );

  // Validation: an item is "valid" if it has no assignedPlayer, OR if its
  // assignedPlayer (trimmed) matches one of the current split slot labels.
  // computeSplit already groups items per slot using exact === match on
  // trimmed labels, so we mirror that exactness here.
  const splitLabels = useMemo(
    () =>
      Array.from(
        { length: split.playerCount },
        (_, i) => players[i]?.trim() || `لاعب ${i + 1}`,
      ),
    [split.playerCount, players],
  );

  const violations = useMemo(() => {
    return items
      .filter((i) => {
        const ap = i.assignedPlayer?.trim();
        return !!ap && !splitLabels.includes(ap);
      })
      .map((i) => ({
        name: i.name,
        assignedPlayer: i.assignedPlayer ?? "",
        qty: i.qty,
      }));
  }, [items, splitLabels]);

  const closeBlocked = violations.length > 0;

  /* ---------------- Modal lifecycle ---------------- */
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = modalRef.current?.querySelector<HTMLElement>(
      FOCUSABLE_SELECTOR,
    );
    first?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = prevOverflow;
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        /* detached */
      }
    };
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function adjustSplit(delta: number) {
    setSplitCount((n) =>
      Math.max(1, Math.min(MAX_SPLIT_COUNT, (Number(n) || 1) + delta)),
    );
  }

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

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
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

          {(items ?? []).length === 0 ? (
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
                  <span className="flex-1 px-3 font-medium print:text-black">
                    {i.name}
                    {i.assignedPlayer && (
                      <span className="mr-2 px-2 py-0.5 rounded-full bg-rust-700/60 text-rust-100 text-xs font-mono print:bg-espresso-100 print:text-espresso-900">
                        {i.assignedPlayer}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-espresso-50 print:text-black">
                    {fmtSAR(i.price * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {hourlyRate !== null && (
            <div className="mt-2 pt-4 border-t border-espresso-800 flex items-center justify-between text-base print:border-black">
              <span className="text-espresso-200 print:text-black">
                تكلفة الوقت ({breakdown.elapsedMinutes} دقيقة)
              </span>
              <span className="font-mono tabular-nums text-espresso-50 print:text-black">
                {fmtSAR(breakdown.timeCost)}
              </span>
            </div>
          )}

          {/* ---------- Split-by-N ---------- */}
          {(items ?? []).length > 0 || hourlyRate !== null ? (
            <section className="mt-2 pt-4 border-t border-espresso-800 no-print">
              <header className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h3 className="font-display text-lg font-bold">تقسيم على</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustSplit(-1)}
                    disabled={busy || splitCount <= 1}
                    aria-label="إنقاص عدد اللاعبين"
                    className="w-10 h-10 rounded-xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-100 text-2xl font-black transition active:scale-95"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={MAX_SPLIT_COUNT}
                    step={1}
                    inputMode="numeric"
                    value={splitCount}
                    onChange={(e) => {
                      const raw = Math.floor(Number(e.target.value) || 1);
                      setSplitCount(
                        Math.max(1, Math.min(MAX_SPLIT_COUNT, raw)),
                      );
                    }}
                    disabled={busy}
                    aria-label="عدد اللاعبين"
                    className="w-16 h-10 rounded-xl bg-espresso-950 border border-espresso-700 text-center font-mono text-xl tabular-nums focus:outline-none focus:border-copper-500"
                  />
                  <button
                    type="button"
                    onClick={() => adjustSplit(1)}
                    disabled={busy || splitCount >= MAX_SPLIT_COUNT}
                    aria-label="زيادة عدد اللاعبين"
                    className="w-10 h-10 rounded-xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-100 text-2xl font-black transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              </header>

              {split.shares.length > 0 && (
                <ul className="grid gap-2" aria-label="حساب كل لاعب">
                  {split.shares.map((s) => (
                    <li
                      key={s.index}
                      className="flex items-center justify-between gap-3 bg-espresso-950 border border-espresso-800 rounded-2xl px-4 py-3"
                    >
                      <span className="flex-1 min-w-0 truncate font-bold">
                        {s.label}
                        {s.individualTotal > 0 && (
                          <span className="ml-2 text-xs text-rust-300 font-mono">
                            (شخصي)
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-copper-300 font-bold text-lg">
                        {fmtSAR(s.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {split.individualItemsTotal > 0 && (
                <p className="text-xs text-espresso-300 mt-2">
                  منتجات مخصصة (خارج التقسيم):{" "}
                  <span className="font-mono tabular-nums">
                    {fmtSAR(split.individualItemsTotal)}
                  </span>
                </p>
              )}
              {split.remainder > 0 && (
                <p className="text-xs text-espresso-300 mt-1">
                  المتبقي (فُرّش على أول لاعب):{" "}
                  <span className="font-mono tabular-nums">
                    {fmtSAR(split.remainder)}
                  </span>
                </p>
              )}
            </section>
          ) : null}

          {/* ---------- Validation banner ---------- */}
          {closeBlocked && (
            <div
              role="alert"
              className="bg-rust-600/15 border border-rust-600/40 rounded-2xl p-4 text-rust-200 no-print"
            >
              <p className="font-bold mb-2">
                لا يمكن إغلاق الجلسة حتى يتم تسوية التخصيصات التالية:
              </p>
              <ul className="text-sm">
                {violations.map((v, i) => (
                  <li key={i} className="font-mono">
                    • “{v.name}” ×{v.qty} مُسند إلى “{v.assignedPlayer}” — ليس
                    من بين اللاعبين الحاليين ({splitLabels.map((l, idx) => (
                      <span key={idx} className="mx-1">
                        {l}
                        {idx < splitLabels.length - 1 ? "،" : ""}
                      </span>
                    ))}
                    ).
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-2 text-rust-300">
                عدّل المنتج (مثلاً: ارفع الكمية إلى 0 ثم أعد الإضافة) أو
                أضف اللاعب إلى قائمة اللاعبين، قبل الإغلاق.
              </p>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="bg-rust-600/15 border border-rust-600/40 rounded-2xl p-4 text-rust-200 no-print"
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
            disabled={busy || closeBlocked}
            aria-disabled={busy || closeBlocked}
            className="no-print min-h-[64px] px-7 rounded-2xl bg-rust-600 hover:bg-rust-500 disabled:opacity-60 text-espresso-50 text-lg font-extrabold shadow-warm transition-colors duration-200 active:scale-[0.98]"
          >
            {busy
              ? "جاري الإغلاق…"
              : closeBlocked
                ? "يوجد تخصيصات غير مسواة"
                : "تأكيد وإغلاق"}
          </button>
        </footer>
      </div>
    </div>
  );
}
