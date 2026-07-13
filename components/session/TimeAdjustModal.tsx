"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Tap-to-adjust-time modal.
 *
 *  • Shows the CURRENT cumulative `timeAdjustmentSeconds` on the session
 *    (seeded from the parent state, not fetched — keep this snappy).
 *  • Lets staff enter a DELTA (minutes + seconds + a `+ / −` sign toggle).
 *  • On confirm: patch the session with `currentCumulative + delta`
 *    (NOT an absolute override — reopening this modal later shows the
 *    running total and the staff can keep stacking corrections).
 *
 * The parent owns the `timeAdjustmentSeconds` state and the live clock
 * already — this modal is purely a UI for nudging that state forward.
 */
export interface TimeAdjustModalProps {
  currentCumulativeSeconds: number;
  busy?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onApply: (newTotalSeconds: number) => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Format a signed second count as "+MM:SS" / "-MM:SS". */
function fmtSigned(seconds: number): string {
  const sign = seconds >= 0 ? "+" : "-";
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimeAdjustModal({
  currentCumulativeSeconds,
  busy = false,
  errorMessage = null,
  onCancel,
  onApply,
}: TimeAdjustModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  /* ----- form state ----- */
  const [sign, setSign] = useState<"+" | "-">("+");
  const [minutes, setMinutes] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);

  // Reset to a clean add-state whenever the modal is freshly opened
  // (parent unmounts/remounts on close — but be defensive for hot-reload).
  useEffect(() => {
    setSign("+");
    setMinutes(0);
    setSeconds(0);
  }, []);

  const delta = sign === "+" ? 1 : -1;
  const deltaSeconds = useMemo(
    () => delta * (Math.max(0, Math.floor(minutes)) * 60 + Math.max(0, Math.min(59, Math.floor(seconds)))),
    [delta, minutes, seconds],
  );
  const newTotal = currentCumulativeSeconds + deltaSeconds;

  /* ----- modal lifecycle: scroll lock + opener-restore + initial focus ----- */
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
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

  /* ----- focus trap (always active, even mid-busy) ----- */
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

  /* ----- ESC closes — gated by !busy so a half-cancelled patch can't happen ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const canConfirm = !busy && minutes >= 0 && seconds >= 0 && seconds < 60;

  function handleConfirm() {
    if (!canConfirm) return;
    onApply(newTotal);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="time-adjust-title"
      dir="rtl"
      className="fixed inset-0 z-50 bg-espresso-950/85 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={modalRef}
        className="bg-espresso-900 border border-copper-800/50 rounded-t-3xl md:rounded-3xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-warm animate-reveal-scale motion-reduce:animate-none"
      >
        <header className="px-6 py-5 border-b border-espresso-800 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-widest text-espresso-300">
            تعديل وقت الجلسة
          </div>
          <h2
            id="time-adjust-title"
            className="font-display text-2xl md:text-3xl font-extrabold"
          >
            تعديل الوقت
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-espresso-800 border border-espresso-700 text-espresso-300">
              التعديل التراكمي الحالي
            </span>
            <span className="font-mono font-black text-2xl text-copper-300 tabular-nums">
              {fmtSigned(currentCumulativeSeconds)}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Sign toggle */}
          <div
            role="radiogroup"
            aria-label="إشارة التعديل"
            className="grid grid-cols-2 gap-2 rounded-2xl bg-espresso-950 border border-espresso-800 p-1"
          >
            {(["+", "-"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sign === s}
                onClick={() => setSign(s)}
                disabled={busy}
                className={[
                  "min-h-[56px] rounded-xl text-2xl font-black transition-colors duration-200",
                  sign === s
                    ? s === "+"
                      ? "bg-copper-600 text-espresso-50 shadow-warm"
                      : "bg-rust-600 text-espresso-50 shadow-warm"
                    : "bg-transparent text-espresso-300 hover:bg-espresso-900",
                ].join(" ")}
              >
                {s === "+" ? "+ زيادة" : "− إنقاص"}
              </button>
            ))}
          </div>

          {/* Minutes + seconds inputs */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-espresso-300">
                دقائق
              </span>
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                inputMode="numeric"
                value={Number.isFinite(minutes) ? minutes : 0}
                onChange={(e) =>
                  setMinutes(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
                disabled={busy}
                className="bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-4 text-3xl font-mono tabular-nums text-espresso-50 text-center focus:outline-none focus:border-copper-500"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-espresso-300">
                ثواني
              </span>
              <input
                type="number"
                min={0}
                max={59}
                step={1}
                inputMode="numeric"
                value={Number.isFinite(seconds) ? seconds : 0}
                onChange={(e) => {
                  const raw = Math.floor(Number(e.target.value) || 0);
                  setSeconds(Math.max(0, Math.min(59, raw)));
                }}
                disabled={busy}
                className="bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-4 text-3xl font-mono tabular-nums text-espresso-50 text-center focus:outline-none focus:border-copper-500"
              />
            </label>
          </div>

          {/* Live preview */}
          <div className="bg-espresso-950 border border-espresso-800 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm uppercase tracking-widest text-espresso-300">
              الجديد بعد التعديل
            </span>
            <span className="font-mono font-black text-3xl text-copper-300 tabular-nums">
              {fmtSigned(newTotal)}
            </span>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="bg-rust-600/15 border border-rust-600/40 rounded-2xl p-4 text-rust-200"
            >
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="px-6 py-5 border-t border-espresso-800 flex flex-wrap items-center gap-3 bg-espresso-950">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[56px] px-6 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-60 text-espresso-100 text-lg font-bold border border-espresso-700 transition-colors duration-200"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="min-h-[64px] flex-1 px-7 rounded-2xl bg-rust-600 hover:bg-rust-500 disabled:opacity-60 text-espresso-50 text-lg font-extrabold shadow-warm transition-colors duration-200 active:scale-[0.98]"
          >
            {busy ? "جاري الحفظ…" : "تأكيد التعديل"}
          </button>
        </footer>
      </div>
    </div>
  );
}
