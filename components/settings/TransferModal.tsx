"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchSessions,
  transferSessionRemote,
} from "@/components/floor/api-client";
import { fmtSAR } from "@/components/domain";
import { getAreaConfig } from "@/lib/config";
import type { AreaType, GroupSession } from "@/lib/types";

/**
 * Transfer a session to a different free table inside the same area.
 *
 * UX:
 *   1. Picker grid shows every table in the area. The current table is
 *      disabled (you can't transfer to yourself); busy tables show the
 *      customer label or "مشغول" and are also disabled.
 *   2. Tapping a free table reveals an inline confirm block — the modal
 *      does NOT navigate away so the user can change their mind.
 *   3. POST on confirm; the server may still 400 if the table became
 *      busy between our last poll and the request. That error is shown
 *      inline (`setError`) instead of navigating.
 *   4. On 200, navigate to /table/{area}-{target} so the next view's
 *      `useEffect` re-fetches and shows the new table identity.
 */
export interface TransferModalProps {
  area: AreaType;
  currentSessionId: string;
  currentTableNumber: number;
  onClose: () => void;
}

export default function TransferModal({
  area,
  currentSessionId,
  currentTableNumber,
  onClose,
}: TransferModalProps) {
  const router = useRouter();
  const { tableCount, label: areaLabel, hourlyRate } = getAreaConfig(area);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // tableNumber → open session occupying it (excluding self)
  const [occupying, setOccupying] = useState<Map<number, GroupSession>>(
    new Map(),
  );

  /* ------- Fetch area's open sessions to know which other tables are busy ------- */
  useEffect(() => {
    let cancelled = false;
    fetchSessions({ area, status: "open" }).then((list) => {
      if (cancelled) return;
      if (list === null) {
        // Fail-soft: assume everything is free. Server is source of truth
        // anyway — the 400 path will catch a real conflict.
        setOccupying(new Map());
        return;
      }
      const map = new Map<number, GroupSession>();
      for (const s of list) {
        if (s.id !== currentSessionId) map.set(s.tableNumber, s);
      }
      setOccupying(map);
    });
    return () => {
      cancelled = true;
    };
  }, [area, currentSessionId]);

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

  /* ------- Confirm + submit ------- */
  async function performTransfer(target: number) {
    setError(null);
    setBusy(true);
    const res = await transferSessionRemote(currentSessionId, target);
    setBusy(false);
    if (res.ok) {
      router.push(`/table/${area}-${target}`);
      return;
    }
    setError(res.message);
    setPicked(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-modal-title"
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/80 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bg-espresso-900 border border-espresso-800 rounded-t-3xl md:rounded-3xl w-full md:max-w-2xl max-h-[92vh] flex flex-col shadow-2xl shadow-black/60">
        <header className="px-6 py-5 border-b border-espresso-800 flex flex-col gap-2">
          <div className="text-xs uppercase tracking-widest text-espresso-300">
            نقل الجلسة
          </div>
          <h2 id="transfer-modal-title" className="font-display text-2xl md:text-3xl font-extrabold">
            <span>{areaLabel}</span>
            <span className="mx-2 text-espresso-400">·</span>
            <span>
              من{" "}
              <span className="font-mono">طاولة {currentTableNumber}</span>
            </span>
          </h2>
          <p className="text-sm text-espresso-300">
            اختر طاولة فارغة في نفس المنطقة لنقل الجلسة إليها.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {picked === null ? (
            <TablePicker
              tableCount={tableCount}
              currentTableNumber={currentTableNumber}
              occupying={occupying}
              onPick={(t) => {
                setError(null);
                setPicked(t);
              }}
            />
          ) : (
            <ConfirmTransfer
              target={picked}
              busy={busy}
              error={error}
              onBack={() => {
                setError(null);
                setPicked(null);
              }}
              onConfirm={() => void performTransfer(picked)}
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
            {hourlyRate === null
              ? "منتجات فقط"
              : `${fmtSAR(hourlyRate)} / ساعة`}
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
    </div>
  );
}

/* --------------- Picker grid --------------- */

function TablePicker({
  tableCount,
  currentTableNumber,
  occupying,
  onPick,
}: {
  tableCount: number;
  currentTableNumber: number;
  /** tableNumber → other open session occupying that table. */
  occupying: Map<number, GroupSession>;
  onPick: (tableNumber: number) => void;
}) {
  const free = Array.from(
    { length: tableCount },
    (_, i) => i + 1,
  ).filter((t) => t !== currentTableNumber && !occupying.has(t));

  if (free.length === 0) {
    return (
      <div className="bg-espresso-950 border border-espresso-800 rounded-2xl p-6 text-center text-espresso-300">
        لا توجد طاولات فارغة في هذه المنطقة الآن.
      </div>
    );
  }

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      }}
    >
      {/* Render the full grid (including busy + current) so users see the
          area's state, not just the tappable subset. */}
      {Array.from({ length: tableCount }, (_, i) => i + 1).map((t) => {
        const isCurrent = t === currentTableNumber;
        const session = occupying.get(t);
        const isBusy = !!session;

        if (isCurrent) {
          return (
            <div
              key={t}
              className="rounded-2xl border-2 border-copper-500/50 bg-copper-600/10 px-3 py-4 flex flex-col items-center gap-1 select-none"
            >
              <span className="text-xs uppercase tracking-widest text-copper-300">
                الحالية
              </span>
              <span className="font-mono font-black text-3xl text-espresso-50">
                {t}
              </span>
            </div>
          );
        }
        if (isBusy) {
          return (
            <div
              key={t}
              className="rounded-2xl border-2 border-rust-600/40 bg-rust-600/10 px-3 py-4 flex flex-col items-center gap-1 select-none opacity-90"
              aria-disabled
            >
              <span className="text-xs uppercase tracking-widest text-rust-300">
                مشغول
              </span>
              <span className="font-mono font-black text-3xl text-espresso-50">
                {t}
              </span>
              <span className="text-xs text-rust-200 line-clamp-1">
                {session.label?.trim() || "جلسة أخرى"}
              </span>
            </div>
          );
        }
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="rounded-2xl border-2 border-espresso-700 hover:border-copper-500 hover:bg-espresso-800 transition active:scale-[0.98] px-3 py-4 flex flex-col items-center gap-1 min-h-[88px] focus-visible:border-copper-400"
          >
            <span className="text-xs uppercase tracking-widest text-espresso-300">
              طاولة
            </span>
            <span className="font-mono font-black text-3xl text-espresso-50">{t}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------- Confirm step --------------- */

function ConfirmTransfer({
  target,
  busy,
  error,
  onBack,
  onConfirm,
}: {
  target: number;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-espresso-950 border border-espresso-800 rounded-2xl p-5 text-center">
        <p className="text-sm uppercase tracking-widest text-espresso-300 mb-2">
          تأكيد النقل
        </p>
        <p className="text-lg">
          هل تريد نقل هذه الجلسة إلى{" "}
          <span className="font-mono font-black text-2xl text-copper-400">
            طاولة {target}
          </span>
          ؟
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
          className="min-h-[56px] px-7 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-60 text-espresso-50 text-lg font-extrabold shadow-lg shadow-copper-950/40 transition-colors duration-200"
        >
          {busy ? "جاري النقل…" : `نقل إلى طاولة ${target}`}
        </button>
      </div>
    </div>
  );
}
