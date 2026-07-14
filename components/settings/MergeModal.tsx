"use client";

import { useEffect, useState } from "react";
import ModalPortal from "@/components/ModalPortal";
import {
  fetchSessions,
  mergeSessionRemote,
} from "@/components/floor/api-client";
import { AREA_THEME } from "@/components/domain";
import { getAreaConfig } from "@/lib/config";
import type { AreaType, GroupSession } from "@/lib/types";

/**
 * Merge another open session into this one. The other tab's items
 * transfer into the absorbing session; the donor session is closed
 * server-side (billedTotal=0).
 *
 * Destructive / hard-to-reverse: after picking a donor, the modal shows
 * an explicit confirmation card (per spec) that names the donor's table
 * before the staff tap "دمج".
 */
export interface MergeModalProps {
  area: AreaType;
  currentSessionId: string;
  currentTableNumber: number;
  onClose: () => void;
  /**
   * Called with the absorbing (updated) session on success so the parent
   * can patch its local `items` state without re-routing / re-fetching.
   */
  onSuccess: (absorbed: GroupSession) => void;
}

export default function MergeModal({
  area,
  currentSessionId,
  currentTableNumber,
  onClose,
  onSuccess,
}: MergeModalProps) {
  const { label: areaLabel } = getAreaConfig(area);

  const [sessions, setSessions] = useState<GroupSession[] | null>(null);
  const [picked, setPicked] = useState<GroupSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ------- Fetch every open session across ALL areas (minus self) -------
   * Cross-area merge: the localdb side no longer restricts merges to the
   * same area, so this picker must list open sessions from snooker, cards,
   * and playstation together.  Each donor row displays its own area label
   * + theme so staff can tell apart "سنوكر · طاولة 5" from "كوتشينة · طاولة
   * 3" without cross-referencing back to the src table. */
  useEffect(() => {
    let cancelled = false;
    fetchSessions({ status: "open" }).then((list) => {
      if (cancelled) return;
      if (list === null) {
        setSessions([]);
        return;
      }
      setSessions(list.filter((s) => s.id !== currentSessionId));
    });
    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  /* ------- Modal lifecycle: opener-restore + scroll-lock + initial focus ------- */
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = document.querySelector<HTMLElement>(
      'div[role="dialog"] button:not([disabled])',
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

  async function performMerge(donor: GroupSession) {
    setError(null);
    setBusy(true);
    const res = await mergeSessionRemote(currentSessionId, donor.id);
    setBusy(false);
    if (res.ok) {
      onSuccess(res.session);
      onClose();
      return;
    }
    setError(res.message);
  }

  return (
    <ModalPortal
      align="sheet"
      backdropClassName="bg-black/80"
      ariaLabelledBy="merge-modal-title"
      onBackdropClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-espresso-900 border border-espresso-800 rounded-t-3xl md:rounded-3xl w-full md:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl shadow-black/60">
        <header className="px-6 py-5 border-b border-espresso-800 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-widest text-espresso-300">
            دمج جلسة أخرى
          </div>
          <h2
            id="merge-modal-title"
            className="font-display text-2xl md:text-3xl font-extrabold"
          >
            <span>{areaLabel}</span>
            <span className="mx-2 text-espresso-400">·</span>
            <span>
              في{" "}
              <span className="font-mono">طاولة {currentTableNumber}</span>
            </span>
          </h2>
          <p className="text-sm text-espresso-300">
            دمج جلسة أخرى يعني نقل كل منتجاتها إلى هذه الجلسة وإغلاق
            الطاولة الأخرى.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {picked === null ? (
            <DonorPicker
              sessions={sessions}
              onPick={(s) => {
                setError(null);
                setPicked(s);
              }}
            />
          ) : (
            <ConfirmMerge
              donor={picked}
              busy={busy}
              error={error}
              onBack={() => {
                setError(null);
                setPicked(null);
              }}
              onConfirm={() => void performMerge(picked)}
            />
          )}

          {error && picked === null && (
            <div
              role="alert"
              className="mt-4 bg-rust-600/15 border border-rust-600/40 rounded-2xl p-4 text-rust-200"
            >
              {error}
            </div>
          )}
        </div>

        <footer className="px-6 py-5 border-t border-espresso-800 flex flex-wrap items-center justify-between gap-3 bg-espresso-950">
          <span className="text-sm text-espresso-300">
            الدمج لا يمكن التراجع عنه داخل هذه الجلسة.
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-60 text-espresso-100 text-base font-bold border border-espresso-700 transition-colors duration-200"
          >
            إلغاء
          </button>
        </footer>
      </div>
    </ModalPortal>
  );
}

/* --------------- Donor picker --------------- */

function DonorPicker({
  sessions,
  onPick,
}: {
  sessions: GroupSession[] | null;
  onPick: (s: GroupSession) => void;
}) {
  if (sessions === null) {
    return (
      <p className="text-espresso-400 text-center py-12 text-lg animate-pulse">
        جارٍ التحميل…
      </p>
    );
  }
  if (sessions.length === 0) {
    return (
      <p className="text-espresso-400 text-center py-12 text-lg">
        لا توجد جلسات مفتوحة أخرى.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((s) => (
        <li key={s.id}>
          <DonorRow donor={s} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

/** Per-donor row that resolves its OWN area label + theme accent. */
function DonorRow({
  donor,
  onPick,
}: {
  donor: GroupSession;
  onPick: (s: GroupSession) => void;
}) {
  const { label: donorAreaLabel } = getAreaConfig(donor.area);
  const donorTheme = AREA_THEME[donor.area];
  return (
    <button
      type="button"
      onClick={() => onPick(donor)}
      className="w-full bg-espresso-950 border border-espresso-800 hover:border-copper-500 hover:bg-espresso-800 transition rounded-2xl px-4 py-3 flex items-center gap-3 min-h-[64px] text-right"
      dir="rtl"
    >
      <span
        aria-hidden
        className={["w-2 h-12 rounded-full self-stretch", donorTheme.accentBg].join(
          " ",
        )}
      />
      <span className="flex flex-col items-start shrink-0 leading-none">
        <span className="text-[10px] uppercase tracking-widest text-espresso-300 font-bold mb-1">
          {donorAreaLabel}
        </span>
        <span className="font-mono font-bold text-2xl tabular-nums text-espresso-50">
          {donor.tableNumber}
        </span>
      </span>
      <span className="flex-1 min-w-0 text-sm text-espresso-200 truncate">
        {donor.label?.trim() || "بدون اسم"}
      </span>
      <span className="text-xs text-espresso-400 tabular-nums">
        {(donor.items ?? []).reduce((n, i) => n + i.qty, 0)} منتج
      </span>
      <span className="text-copper-400 font-bold text-sm">دمج ←</span>
    </button>
  );
}

/* --------------- Confirm step --------------- */

function ConfirmMerge({
  donor,
  busy,
  error,
  onBack,
  onConfirm,
}: {
  donor: GroupSession;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const itemCount = (donor.items ?? []).reduce((n, i) => n + i.qty, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-copper-500/10 border border-copper-500/40 rounded-2xl p-5 text-center">
        <p className="text-base">
          سيتم نقل{" "}
          <span className="font-mono font-black text-xl text-copper-300">
            كل منتجات طاولة {donor.tableNumber}
          </span>
          {" "}لهذه الجلسة وإغلاق طاولة {donor.tableNumber}.
        </p>
        <p className="text-xs text-espresso-300 mt-2">
          عدد المنتجات على طاولة {donor.tableNumber}:{" "}
          <span className="font-mono">{itemCount}</span>
          {donor.label?.trim() ? (
            <>
              {" "}— الاسم: <span className="text-espresso-100">{donor.label}</span>
            </>
          ) : null}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-rust-600/15 border border-rust-600/40 rounded-2xl p-4 text-rust-200"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 justify-end">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-60 text-espresso-100 text-base font-bold border border-espresso-700 transition-colors duration-200"
        >
          رجوع
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-[56px] px-7 rounded-2xl bg-copper-500 hover:bg-copper-400 disabled:opacity-60 text-espresso-50 text-lg font-extrabold shadow-lg shadow-copper-950/40 transition-colors duration-200"
        >
          {busy ? "جاري الدمج…" : "تأكيد الدمج"}
        </button>
      </div>
    </div>
  );
}
