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

export interface ProductOnlySessionViewProps {
  sessionId: string;
  area: AreaType;
  tableNumber: number;
  openedAt: string;
  initialItems: SessionItem[];
  /** Pre-existing customer label, if any. */
  initialLabel?: string;
}

const ITEMS_DEBOUNCE_MS = 400;
const LABEL_DEBOUNCE_MS = 600;

/** Cards session view (rate=null). Same item/close + modal flow as Timed. */
export default function ProductOnlySessionView({
  sessionId,
  area,
  tableNumber,
  openedAt,
  initialItems,
  initialLabel,
}: ProductOnlySessionViewProps) {
  const router = useRouter();
  const areaLabel = getAreaConfig(area).label;

  const [items, setItems] = useState<SessionItem[]>(initialItems);
  const [label, setLabel] = useState<string>(initialLabel ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closeErrorMessage, setCloseErrorMessage] = useState<string | null>(
    null,
  );

  /* ------------ Live catalog from /api/products ------------ */
  const [catalog, setCatalog] = useState<{
    categories: Category[];
    products: Product[];
  } | null>(null);
  const [catalogState, setCatalogState] = useState<
    "loading" | "ok" | "error"
  >("loading");

  // Single-source-of-truth AbortController — referenced by a ref so a retry
  // call can abort the previous in-flight request before starting a new one.
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
    <div className="pb-40" dir="rtl">
      <SessionHeader
        area={area}
        tableNumber={tableNumber}
        hourlyRate={null}
        elapsedMs={null}
        labelValue={label}
        onLabelChange={setLabel}
      />

      <section className="mt-6 flex flex-col gap-3">
        <h3 className="text-xl font-bold">المنتجات</h3>
        {catalogState === "loading" || catalog === null ? (
          <p className="text-neutral-500 text-center py-12 text-lg animate-pulse">
            جارٍ تحميل المنتجات…
          </p>
        ) : catalogState === "error" ? (
          <div
            className="bg-red-600/10 border border-red-600/40 rounded-3xl p-6 text-center"
            role="status"
            dir="rtl"
          >
            <p className="text-red-300 text-lg mb-3">
              تعذّر تحميل المنتجات.
            </p>
            <button
              type="button"
              onClick={loadCatalog}
              className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold min-h-[48px]"
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
          />
        )}
      </section>

      {items.length > 0 && (
        <section className="mt-8">
          <h3 className="text-xl font-bold mb-3">الطلب الحالي</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((i) => (
              <li
                key={i.productId}
                className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3"
              >
                <span className="font-mono text-neutral-400 w-10 text-center">
                  {i.qty}×
                </span>
                <span className="flex-1 px-3 font-medium">{i.name}</span>
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
          onCancel={cancelClose}
          onConfirm={performClose}
        />
      )}
    </div>
  );
}
