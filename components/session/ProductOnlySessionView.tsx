"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AreaType,
  Category,
  Product,
  SessionItem,
} from "@/lib/types";
import { getAreaConfig } from "@/lib/config";
import { fmtSAR } from "@/components/domain";
import {
  closeSessionRemote,
  fetchProducts,
  patchSessionRemote,
} from "@/components/floor/api-client";
import { computeBill } from "./bill";
import ProductPicker from "./ProductPicker";
import BillSummaryBar from "./BillSummaryBar";
import SessionHeader from "./SessionHeader";
import BillConfirmModal from "./BillConfirmModal";
import TransferModal from "@/components/settings/TransferModal";
import MergeModal from "@/components/settings/MergeModal";

export interface ProductOnlySessionViewProps {
  sessionId: string;
  area: AreaType;
  tableNumber: number;
  openedAt: string;
  initialItems: SessionItem[];
  /** Pre-existing customer label, if any. */
  initialLabel?: string;
  initialPlayers?: string[];
  /** Accepted but unused — Cards has no clock, so time adjustment is
   *  never surfaced; kept in the contract so both views share the same
   *  prop shape and DesktopTableClient can blindly spread. */
  initialTimeAdjustmentSeconds?: number;
}

const ITEMS_DEBOUNCE_MS = 400;
const LABEL_DEBOUNCE_MS = 600;

/** Cards session view (rate=null). Same item/close + modal flow as Timed,
 *  minus the clock + time-adjust (Cards doesn't bill by time). */
export default function ProductOnlySessionView({
  sessionId,
  area,
  tableNumber,
  openedAt,
  initialItems,
  initialLabel,
  initialPlayers,
}: ProductOnlySessionViewProps) {
  const router = useRouter();
  const areaLabel = getAreaConfig(area).label;

  const [items, setItems] = useState<SessionItem[]>(initialItems);
  const [label, setLabel] = useState<string>(initialLabel ?? "");
  const [players, setPlayers] = useState<string[]>(initialPlayers ?? []);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeErrorMessage, setCloseErrorMessage] = useState<string | null>(
    null,
  );
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  /* ------------ Live catalog from /api/products ------------ */
  const [catalog, setCatalog] = useState<{
    categories: Category[];
    products: Product[];
  } | null>(null);
  const [catalogState, setCatalogState] = useState<
    "loading" | "ok" | "error"
  >("loading");

  const catalogCtrlRef = useRef<AbortController | null>(null);

  const loadCatalog = useCallback(() => {
    catalogCtrlRef.current?.abort();
    const ctrl = new AbortController();
    catalogCtrlRef.current = ctrl;
    setCatalogState("loading");
    void fetchProducts({ signal: ctrl.signal }).then((res) => {
      if (ctrl.signal.aborted) return;
      if (res) {
        setCatalog(res);
        setCatalogState("ok");
      } else {
        setCatalogState("error");
      }
    });
  }, []);

  useEffect(() => {
    loadCatalog();
    return () => {
      catalogCtrlRef.current?.abort();
      catalogCtrlRef.current = null;
    };
  }, [loadCatalog]);

  /* ------------ Debounced server sync ------------ */
  const lastSyncedItems = useRef<SessionItem[]>(initialItems);
  const itemsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (busy) return;
    const handle = setTimeout(() => {
      if (busy) return;
      if (items === lastSyncedItems.current) return;
      lastSyncedItems.current = items;
      void patchSessionRemote(sessionId, { items });
    }, ITEMS_DEBOUNCE_MS);
    itemsTimerRef.current = handle;
    return () => clearTimeout(handle);
  }, [items, sessionId, busy]);

  const lastSyncedLabel = useRef<string>(initialLabel ?? "");
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (busy) return;
    if (label === lastSyncedLabel.current) return;
    const handle = setTimeout(() => {
      if (busy) return;
      lastSyncedLabel.current = label;
      void patchSessionRemote(sessionId, { label });
    }, LABEL_DEBOUNCE_MS);
    labelTimerRef.current = handle;
    return () => clearTimeout(handle);
  }, [label, sessionId, busy]);

  const lastSyncedPlayers = useRef<string[]>(initialPlayers ?? []);
  const playersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (busy) return;
    const prev = lastSyncedPlayers.current;
    const sameLen = prev.length === players.length;
    const sameOrder = sameLen && players.every((p, i) => p === prev[i]);
    if (sameOrder) return;
    const handle = setTimeout(() => {
      if (busy) return;
      lastSyncedPlayers.current = players;
      void patchSessionRemote(sessionId, { players });
    }, LABEL_DEBOUNCE_MS);
    playersTimerRef.current = handle;
    return () => clearTimeout(handle);
  }, [players, sessionId, busy]);

  const breakdown = useMemo(
    () => computeBill(items, openedAt, null, null),
    [items, openedAt],
  );

  /* ------------ Close flow: tap → modal → confirm → API ------------ */
  const handleCloseTap = useCallback(() => {
    if (busy) return;
    setConfirmOpen(true);
    setCloseErrorMessage(null);
  }, [busy]);

  const cancelClose = useCallback(() => {
    if (busy) return;
    setConfirmOpen(false);
    setCloseErrorMessage(null);
  }, [busy]);

  const performClose = useCallback(async () => {
    setBusy(true);
    setCloseErrorMessage(null);
    if (itemsTimerRef.current) clearTimeout(itemsTimerRef.current);
    if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
    if (playersTimerRef.current) clearTimeout(playersTimerRef.current);
    const result = await closeSessionRemote(sessionId, {
      items,
      billedTotal: breakdown.total,
      closedAt: new Date().toISOString(),
    });
    setBusy(false);
    if (!result) {
      setCloseErrorMessage(
        "تعذّر إغلاق الجلسة. تأكّد من الاتصال وحاول مرة أخرى.",
      );
      return;
    }
    router.push("/history");
  }, [sessionId, items, breakdown, router]);

  return (
    <div
      style={{ paddingBottom: "var(--bill-bar-h, 10rem)" }}
      dir="rtl"
    >
      <SessionHeader
        area={area}
        tableNumber={tableNumber}
        hourlyRate={null}
        elapsedMs={null}
        labelValue={label}
        onLabelChange={setLabel}
        players={players}
        onPlayersChange={setPlayers}
      />

      <section
        className="mt-4 flex flex-wrap items-center gap-2"
        aria-label="إجراءات الجلسة"
      >
        <button
          type="button"
          onClick={() => setShowTransfer(true)}
          disabled={busy}
          className="min-h-[48px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-100 text-sm font-bold border border-espresso-700 transition-colors duration-200"
        >
          نقل الطاولة
        </button>
        <button
          type="button"
          onClick={() => setShowMerge(true)}
          disabled={busy}
          className="min-h-[48px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-100 text-sm font-bold border border-espresso-700 transition-colors duration-200"
        >
          دمج مع طاولة أخرى
        </button>
      </section>

      <section className="mt-6 flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold">المنتجات</h3>
        {catalogState === "loading" || catalog === null ? (
          <p className="text-espresso-400 text-center py-12 text-lg animate-pulse">
            جارٍ تحميل المنتجات…
          </p>
        ) : catalogState === "error" ? (
          <div
            className="bg-rust-600/10 border border-rust-600/40 rounded-3xl p-6 text-center"
            role="status"
            dir="rtl"
          >
            <p className="text-rust-300 text-lg mb-3">
              تعذّر تحميل المنتجات.
            </p>
            <button
              type="button"
              onClick={loadCatalog}
              className="px-5 py-3 rounded-2xl bg-rust-600 hover:bg-rust-500 text-espresso-50 font-bold min-h-[48px] transition-colors duration-200"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <ProductPicker
            categories={catalog.categories}
            products={catalog.products}
            items={items}
            onChange={setItems}
            players={players}
          />
        )}
      </section>

      {items.length > 0 && (
        <section className="mt-8">
          <h3 className="font-display text-xl font-bold mb-3">الطلب الحالي</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((i) => (
              <li
                key={i.productId}
                className="flex items-center justify-between bg-espresso-900 border border-espresso-800 rounded-2xl px-4 py-3"
              >
                <span className="font-mono text-espresso-300 w-10 text-center">
                  {i.qty}×
                </span>
                <span className="flex-1 px-3 font-medium">
                  {i.name}
                  {i.assignedPlayer && (
                    <span className="mr-2 px-2 py-0.5 rounded-full bg-rust-700/60 text-rust-100 text-xs font-mono">
                      {i.assignedPlayer}
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums">
                  {fmtSAR(i.price * i.qty)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BillSummaryBar
        breakdown={breakdown}
        itemsCount={items.reduce((s, i) => s + i.qty, 0)}
        showTimeCost={false}
        onClose={handleCloseTap}
        busy={busy}
      />

      {confirmOpen && (
        <BillConfirmModal
          areaLabel={areaLabel}
          tableNumber={tableNumber}
          hourlyRate={null}
          items={items}
          breakdown={breakdown}
          busy={busy}
          errorMessage={closeErrorMessage}
          customerLabel={label}
          players={players}
          onCancel={cancelClose}
          onConfirm={performClose}
        />
      )}

      {showTransfer && (
        <TransferModal
          area={area}
          currentSessionId={sessionId}
          currentTableNumber={tableNumber}
          onClose={() => setShowTransfer(false)}
        />
      )}
      {showMerge && (
        <MergeModal
          area={area}
          currentSessionId={sessionId}
          currentTableNumber={tableNumber}
          onClose={() => setShowMerge(false)}
          onSuccess={(absorbed) => {
            if (absorbed.items) setItems(absorbed.items);
          }}
        />
      )}
    </div>
  );
}
