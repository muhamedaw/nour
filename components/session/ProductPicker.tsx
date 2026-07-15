"use client";

import { useMemo, useState } from "react";
import { fmtSAR } from "@/components/domain";
import type { Category, Product, SessionItem } from "@/lib/types";
import HighlightAssignModal from "./HighlightAssignModal";

export interface ProductPickerProps {
  categories: Category[];
  products: Product[];
  items: SessionItem[];
  onChange: (next: SessionItem[]) => void;
  /** Current session players (from the parent's chips list). Used by the
   *  highlight-step prompt so the staff can tap a chip instead of typing
   *  a name. */
  players: string[];
}

/**
 * Snap-scroll category strip + product grid with big +/- qty buttons.
 *  • Categories snap horizontally; big touch targets.
 *  • Each product card shows its current qty badge and a +/- pair
 *    sized for thumbs (~56px).
 *  • Products flagged `highlightFlag` (e.g. cigarettes — billed wholly
 *    to one player, not split) get a vivid rust-ringed card so staff
 *    can't miss them. On the first `inc()` of such a product, a
 *    HighlightAssignModal opens to capture the assignee.
 */
export default function ProductPicker({
  categories,
  products,
  items,
  onChange,
  players,
}: ProductPickerProps) {
  const [activeCat, setActiveCat] = useState<string>(
    categories[0]?.id ?? "",
  );
  // Which product is mid-prompt (only one at a time — backdrop blocks
  // the grid while a choice is pending).
  const [assignPromptProduct, setAssignPromptProduct] = useState<Product | null>(
    null,
  );

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.order - b.order),
    [categories],
  );

  const visibleProducts = useMemo(
    () => products.filter((p) => p.categoryId === activeCat),
    [products, activeCat],
  );

  const qty = (productId: string) =>
    items.find((i) => i.productId === productId)?.qty ?? 0;

  const assignName = (productId: string) =>
    items.find((i) => i.productId === productId)?.assignedPlayer;

  function inc(p: Product) {
    const existing = items.find((i) => i.productId === p.id);
    if (existing) {
      // Already on the bill — just bump qty. Assignment (if any) is
      // per-item, not per-qty, so we don't re-prompt.
      onChange(
        items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)),
      );
      return;
    }
    if (p.highlightFlag) {
      // Open the assign prompt BEFORE adding the item; the modal's
      // onAssign callback commits the new row with assignedPlayer set,
      // and onCancel silently drops the bump.
      setAssignPromptProduct(p);
      return;
    }
    onChange([
      ...items,
      { productId: p.id, name: p.name, price: p.price, qty: 1 },
    ]);
  }

  function dec(p: Product) {
    const existing = items.find((i) => i.productId === p.id);
    if (!existing) return;
    if (existing.qty <= 1) {
      onChange(items.filter((i) => i.productId !== p.id));
    } else {
      onChange(
        items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty - 1 } : i)),
      );
    }
  }

  function commitAssign(playerName: string) {
    const product = assignPromptProduct;
    if (!product) return;
    setAssignPromptProduct(null);
    onChange([
      ...items,
      {
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: 1,
        assignedPlayer: playerName.trim(),
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <nav
        aria-label="فئات المنتجات"
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1"
        dir="rtl"
      >
        {sortedCats.map((c) => {
          const active = c.id === activeCat;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCat(c.id)}
              className={[
                "snap-start whitespace-nowrap px-6 py-3 rounded-full text-base font-semibold",
                "transition-colors border-2 min-w-[96px] min-h-[48px]",
                active
                  ? "bg-white text-espresso-900 border-white"
                  : "bg-espresso-900 text-espresso-100 border-espresso-700 hover:border-espresso-400",
              ].join(" ")}
            >
              {c.name}
            </button>
          );
        })}
      </nav>

      {visibleProducts.length === 0 ? (
        <p className="text-espresso-400 text-center py-12">
          لا توجد منتجات في هذه الفئة.
        </p>
      ) : (
        <ul
          className="grid gap-3 md:gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          }}
        >
          {visibleProducts.map((p) => {
            const q = qty(p.id);
            const owner = assignName(p.id);
            const isHighlight = !!p.highlightFlag;
            // Highlighted cards: extra-loud rust treatment so staff can't
            // miss them — 4px rust ring + bold border, distinct from any
            // espresso/copper normal card.
            const cardClass = isHighlight
              ? [
                  "rounded-2xl border-4 p-3 flex flex-col gap-3 ring-2 ring-rust-400/70",
                  "shadow-[0_0_0_2px_rgba(214,102,70,0.25)]",
                  q > 0
                    ? "bg-rust-700/80 border-rust-300"
                    : "bg-rust-700/40 border-rust-500/80",
                ].join(" ")
              : q > 0
                ? "rounded-2xl border-2 p-3 flex flex-col gap-3 bg-espresso-800 border-copper-500/60"
                : "rounded-2xl border-2 p-3 flex flex-col gap-3 bg-espresso-900 border-espresso-800";

            return (
              <li key={p.id} className={cardClass}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold leading-tight">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm text-espresso-300">
                    {fmtSAR(p.price)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {isHighlight && (
                    <span className="px-2 py-0.5 rounded-full bg-rust-600 text-espresso-50 text-xs font-extrabold uppercase tracking-widest">
                      مميز
                    </span>
                  )}
                  {owner && (
                    <span
                      className="px-2 py-0.5 rounded-full bg-espresso-950/70 text-rust-200 text-xs font-mono truncate max-w-[10ch]"
                      title={owner}
                    >
                      {owner}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 mt-auto">
                  <button
                    type="button"
                    onClick={() => dec(p)}
                    disabled={q === 0}
                    aria-label={`إنقاص ${p.name}`}
                    className={[
                      "w-12 h-12 rounded-2xl text-2xl font-black shrink-0",
                      "transition active:scale-95",
                      q === 0
                        ? "bg-espresso-800 text-espresso-600 cursor-not-allowed"
                        : "bg-rust-600/90 hover:bg-rust-600 text-espresso-50",
                    ].join(" ")}
                  >
                    −
                  </button>
                  {p.imageDataUrl ? (
                    <div className="flex-1 flex items-center justify-center relative h-12">
                      <img
                        src={p.imageDataUrl}
                        alt=""
                        className="w-full h-full object-contain bg-espresso-900 rounded-xl border border-espresso-800"
                        loading="lazy"
                      />
                      {q > 0 && (
                        <span
                          className="absolute top-1 right-1 bg-espresso-950/90 text-espresso-50 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold"
                          aria-live="polite"
                        >
                          {q}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      className="font-mono text-4xl font-black w-16 text-center tabular-nums flex-1"
                      aria-live="polite"
                    >
                      {q}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => inc(p)}
                    aria-label={`زيادة ${p.name}`}
                    className={[
                      "w-12 h-12 rounded-2xl text-2xl font-black shrink-0",
                      "transition active:scale-95",
                      isHighlight
                        ? "bg-rust-500 hover:bg-rust-400 text-espresso-50"
                        : "bg-copper-600 hover:bg-copper-500 text-espresso-50",
                    ].join(" ")}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Assign-step modal (only mounted while a choice is pending). */}
      {assignPromptProduct && (
        <HighlightAssignModal
          product={assignPromptProduct}
          players={players}
          onCancel={() => setAssignPromptProduct(null)}
          onAssign={commitAssign}
        />
      )}
    </div>
  );
}
