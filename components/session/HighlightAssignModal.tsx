"use client";

import { useEffect, useRef, useState } from "react";
import ModalPortal from "@/components/ModalPortal";
import { fmtSAR } from "@/components/domain";
import type { Product } from "@/lib/types";

/**
 * Modal that fires when staff `inc()` a `highlightFlag` product for the
 * first time (qty goes 0 → 1). It captures which player the product
 * belongs to so the item can be billed wholly to that person at close —
 * exempt from the even split, included in the share's `individualTotal`.
 *
 * UX:
 *   • If `players` is non-empty, the operator sees one chip per existing
 *     player. Tap → assign and confirm.
 *   • Below (or only, when `players` is empty) is an inline text input
 *     for "لاعب آخر" so the staff never get blocked on a missing player
 *     entry — even with an empty list they can type a name/number
 *     right here and the cash drawer moves on.
 *   • `Cancel` discards the bump entirely (the parent has not yet called
 *     onChange, so qty stays at 0 — the intentional highlight step
 *     never silently bumps).
 *
 * Decrementing (`dec`) never opens this — assignment is per-item, not
 * per-qty; re-opening the modal to "move" the assignment is out of scope.
 */
export interface HighlightAssignModalProps {
  product: Product;
  players: string[];
  busy?: boolean;
  onCancel: () => void;
  onAssign: (playerName: string) => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function HighlightAssignModal({
  product,
  players,
  busy = false,
  onCancel,
  onAssign,
}: HighlightAssignModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function confirmDraft() {
    if (busy) return;
    const clean = draft.trim();
    if (!clean) return;
    onAssign(clean);
  }

  return (
    <ModalPortal
      align="sheet"
      backdropClassName="bg-espresso-950/85"
      ariaLabelledBy="highlight-assign-title"
      onBackdropClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={modalRef}
        className="bg-espresso-900 border border-rust-600/60 rounded-t-3xl md:rounded-3xl w-full md:max-w-lg max-h-[92vh] flex flex-col shadow-warm animate-reveal-scale motion-reduce:animate-none"
      >
        <header className="px-6 py-5 border-b border-espresso-800 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-widest text-rust-300 flex items-center gap-2">
            <span aria-hidden>🚨</span>
            منتج فردي — يجب التخصيص
          </div>
          <h2
            id="highlight-assign-title"
            className="font-display text-2xl md:text-3xl font-extrabold"
          >
            <span>{product.name}</span>
            <span className="mx-2 text-espresso-400">·</span>
            <span className="font-mono tabular-nums">{fmtSAR(product.price)}</span>
          </h2>
          <p className="text-sm text-espresso-300">
            هذا المنتج لا يدخل في التقسيم العادل؛ اختر اللاعب الذي سيُحسب عليه بالكامل.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {players.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-espresso-300">
                اللاعبون الحاليون
              </span>
              <ul className="flex flex-wrap gap-2" aria-label="اختر لاعبًا">
                {players.map((p, i) => (
                  <li key={`${p}-${i}`}>
                    <button
                      type="button"
                      onClick={() => {
                        if (busy) return;
                        onAssign(p);
                      }}
                      disabled={busy}
                      className="px-5 py-3 rounded-full bg-rust-700/70 hover:bg-rust-600 disabled:opacity-50 text-espresso-50 text-base font-bold border-2 border-rust-500/80 min-h-[48px] transition-colors duration-200 active:scale-[0.98]"
                    >
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmDraft();
            }}
            className="flex flex-col gap-2"
          >
            <span className="text-xs uppercase tracking-widest text-espresso-300">
              {players.length > 0 ? "أو ادخل اسماً آخر" : "اسم اللاعب أو رقم"}
            </span>
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="مثال: أحمد / لاعب 3"
                maxLength={32}
                disabled={busy}
                autoFocus
                className="flex-1 bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-3 text-lg focus:outline-none focus:border-rust-500"
                aria-label="اسم اللاعب الآخر"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="min-h-[56px] px-5 rounded-2xl bg-rust-600 disabled:opacity-50 hover:bg-rust-500 text-espresso-50 font-bold transition-colors duration-200"
              >
                إضافة
              </button>
            </div>
          </form>
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
        </footer>
      </div>
    </ModalPortal>
  );
}
