"use client";

/**
 * ModalPortal — shared portal shell for the app's full-screen dialogs
 * (BillConfirmModal, HighlightAssignModal, TimeAdjustModal, MergeModal,
 * TransferModal, TelegramSetupGuide).
 *
 * `.app-shell` (app/globals.css) is `transform: scale(var(--app-scale))`,
 * which makes it the CSS containing block AND stacking context for any
 * `position: fixed` descendant that isn't portaled out of it. A dialog
 * rendered inline inside `.app-shell` collapses to `.app-shell`'s own box
 * instead of the true viewport, and its z-index only competes against
 * siblings inside that same stacking context — it can never out-rank a
 * portaled sibling like BillSummaryBar.tsx/OtaUpdater.tsx, no matter how
 * high the z-index is set. This mirrors those two components' own
 * createPortal-to-document.body pattern, extended with a second scale
 * layer since a full-screen dimming backdrop can't be scaled as a single
 * unit the way a small bottom bar can (see the two-layer note below).
 *
 * Two layers:
 *   1. Outer — true-viewport-sized `fixed inset-0` backdrop (NOT scaled).
 *      Owns dim/blur/print/animation classes and role="dialog" wiring.
 *      Scaling this too would shrink the dim layer itself, leaving
 *      visible undimmed real-screen margins on phones — wrong for a
 *      full-screen overlay (unlike BillSummaryBar's small bottom bar,
 *      where scaling the whole box is fine).
 *   2. Canvas — a width:1024px design-space box, transform:scale, exactly
 *      like .app-shell itself, so the dialog card's existing Tailwind
 *      classes (sized for the 1024px canvas like the rest of the app)
 *      render at the correct visual size relative to everything else.
 *
 * transform never changes flex layout — flexbox positions/sizes an
 * element using its PRE-transform box, and transform-origin only picks
 * the pivot point for the paint-time shrink. So the outer layer centers
 * the canvas's full pre-transform box in the real viewport first; then as
 * long as the canvas's transform-origin stays matched to whichever edge
 * the outer flex anchored it to (bottom for "sheet" mode on phones,
 * center for "center" mode / md+), the visual result stays correctly
 * positioned after the shrink — see .modal-portal-canvas /
 * .modal-portal-canvas--sheet in app/globals.css.
 *
 * SSR/hydration: document.body only exists post-mount, so — same as
 * BillSummaryBar — the first render returns null and the portal is
 * created after a mount effect.
 */

import { useEffect, useState, type MouseEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ModalPortalAlign = "sheet" | "center";

export interface ModalPortalProps {
  /** "sheet"  — bottom sheet on phones, vertically centered at md+
   *             (the items-end md:items-center pattern most dialogs use).
   *  "center" — always vertically centered (TelegramSetupGuide). */
  align: ModalPortalAlign;
  /** Backdrop dim/blur/animation/print classes — everything each dialog's
   *  outer fixed inset-0 div used to carry besides positioning/layout. */
  backdropClassName: string;
  /** Real-viewport padding around the dialog card. */
  paddingClassName?: string;
  ariaLabelledBy: string;
  ariaDescribedBy?: string;
  /** Same handler each dialog already had — attached identically to both
   *  the true-viewport backdrop AND the inner scale-canvas so a click
   *  anywhere in the dim area dismisses (see file header's "gutter
   *  click" rationale); each dialog's own e.target === e.currentTarget
   *  check keeps working unmodified since currentTarget is always
   *  whichever element the handler is bound to. */
  onBackdropClick: MouseEventHandler<HTMLDivElement>;
  /** The dialog card — each modal's existing inner div, unchanged. */
  children: ReactNode;
}

export default function ModalPortal({
  align,
  backdropClassName,
  paddingClassName = "p-0 md:p-4",
  ariaLabelledBy,
  ariaDescribedBy,
  onBackdropClick,
  children,
}: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const outerJustify = align === "sheet" ? "justify-end md:justify-center" : "justify-center";
  const canvasVariant = align === "sheet" ? "modal-portal-canvas--sheet" : "";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      dir="rtl"
      className={`fixed inset-0 z-50 flex flex-col items-center ${outerJustify} ${backdropClassName}`}
      onClick={onBackdropClick}
    >
      <div
        className={`modal-portal-canvas ${canvasVariant} flex justify-center flex-shrink-0 ${paddingClassName}`}
        style={{ width: "var(--app-base-w)", transform: "scale(var(--app-scale))" }}
        onClick={onBackdropClick}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
