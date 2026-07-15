"use client";

/**
 * ModalPortal — shared portal shell for the app's full-screen dialogs
 * (BillConfirmModal, HighlightAssignModal, TimeAdjustModal, MergeModal,
 * TransferModal, TelegramSetupGuide).
 *
 * `.app-shell` (app/globals.css) creates a new stacking context, and a
 * dialog rendered inline inside it would have its z-index competing only
 * against siblings inside that same context — it could never out-rank a
 * portaled sibling like BillSummaryBar.tsx/OtaUpdater.tsx no matter how
 * high the z-index is set. This portals straight to document.body
 * instead, same pattern as those two components.
 *
 * Two layers:
 *   1. Outer — true-viewport-sized `fixed inset-0` backdrop. Owns
 *      dim/blur/print/animation classes, role="dialog" wiring, and the
 *      align="sheet" (bottom-anchored on phone, centered at md+) vs
 *      align="center" (always centered) justify-content.
 *   2. Canvas — `.modal-portal-canvas` (app/globals.css): real viewport
 *      width up to the 1024px design ceiling, mirroring `.app-shell`'s
 *      own responsive-width pattern, so each dialog's own
 *      `w-full md:max-w-*` inner card sizes correctly against the real
 *      screen instead of a fixed design-space box.
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
  paddingClassName = "p-3 md:p-4",
  ariaLabelledBy,
  ariaDescribedBy,
  onBackdropClick,
  children,
}: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const outerJustify = align === "sheet" ? "justify-end md:justify-center" : "justify-center";

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
        className={`modal-portal-canvas flex justify-center flex-shrink-0 ${paddingClassName}`}
        onClick={onBackdropClick}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
