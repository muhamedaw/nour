"use client";

import { useMemo, useState } from "react";
import { fmtSAR } from "@/components/domain";
import type { Category, Product, SessionItem } from "@/lib/types";

export interface ProductPickerProps {
  categories: Category[];
  products: Product[];
  items: SessionItem[];
  onChange: (next: SessionItem[]) => void;
}

/**
 * Snap-scroll category strip + product grid with big +/- qty buttons.
 *  • Categories snap horizontally; big touch targets.
 *  • Each product card shows its current qty badge and a +/- pair
 *    sized for thumbs (~56px).
 */
export default function ProductPicker({
  categories,
  products,
  items,
  onChange,
}: ProductPickerProps) {
  // Default to first category if present.
  const [activeCat, setActiveCat] = useState<string>(
    categories[0]?.id ?? "",
  );

  // Sort by locked `order` field on Category for stable display.
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

  const inc = (p: Product) => {
    const existing = items.find((i) => i.productId === p.id);
    if (existing) {
      onChange(
        items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)),
      );
    } else {
      onChange([
        ...items,
        { productId: p.id, name: p.name, price: p.price, qty: 1 },
      ]);
    }
  };

  const dec = (p: Product) => {
    const existing = items.find((i) => i.productId === p.id);
    if (!existing) return;
    if (existing.qty <= 1) {
      onChange(items.filter((i) => i.productId !== p.id));
    } else {
      onChange(
        items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty - 1 } : i)),
      );
    }
  };

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
                  ? "bg-white text-neutral-900 border-white"
                  : "bg-neutral-900 text-neutral-200 border-neutral-700 hover:border-neutral-500",
              ].join(" ")}
            >
              {c.name}
            </button>
          );
        })}
      </nav>

      {visibleProducts.length === 0 ? (
        <p className="text-neutral-500 text-center py-12">
          لا توجد منتجات في هذه الفئة.
        </p>
      ) : (
        <ul
          className="grid gap-3 md:gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {visibleProducts.map((p) => {
            const q = qty(p.id);
            return (
              <li
                key={p.id}
                className={[
                  "rounded-2xl border-2 p-4 flex flex-col gap-3",
                  q > 0
                    ? "bg-neutral-800 border-emerald-500/60"
                    : "bg-neutral-900 border-neutral-800",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold leading-tight">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm text-neutral-400">
                    {fmtSAR(p.price)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-auto">
                  <button
                    type="button"
                    onClick={() => dec(p)}
                    disabled={q === 0}
                    aria-label={`إنقاص ${p.name}`}
                    className={[
                      "w-16 h-16 rounded-2xl text-4xl font-black",
                      "transition active:scale-95",
                      q === 0
                        ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                        : "bg-red-600/90 hover:bg-red-600 text-white",
                    ].join(" ")}
                  >
                    −
                  </button>
                  <span
                    className="font-mono text-4xl font-black w-16 text-center tabular-nums"
                    aria-live="polite"
                  >
                    {q}
                  </span>
                  <button
                    type="button"
                    onClick={() => inc(p)}
                    aria-label={`زيادة ${p.name}`}
                    className="w-16 h-16 rounded-2xl text-4xl font-black bg-emerald-600 hover:bg-emerald-500 text-white transition active:scale-95"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
