"use client";

import { useEffect, useRef, useState } from "react";
import { fmtSAR } from "@/components/domain";
import {
  createCategoryRemote,
  createProductRemote,
  deleteCategoryRemote,
  deleteProductRemote,
  fetchProducts,
  updateProductRemote,
} from "@/components/floor/api-client";
import type { Category, Product } from "@/lib/types";
import { resizeImageFileToJpegDataUrl } from "./imageResize";

/**
 * Category + product CRUD backed by `/api/products`.
 *
 *  • On mount: GET `/api/products` → seeds local state.
 *  • Mutations: POST/PATCH/DELETE → only commit to state on success.
 *  • All API failures degrade silently (the api-client logs + returns null).
 *
 * Per-product image (optional): the staff picks a file, the client compresses
 * it to a ≤256px JPEG @ quality ~0.7, and stores the result as
 * `imageDataUrl` on the Product row. The thumbnail renders in the list
 * to recognize items at a glance.
 */

type Draft = {
  name: string;
  price: number;
  imageDataUrl: string | null;
  highlightFlag: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  price: 0,
  imageDataUrl: null,
  highlightFlag: false,
};

export default function ProductManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [imageError, setImageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const reload = () => {
    setLoading(true);
    setLoadError(false);
    fetchProducts().then((res) => {
      if (res) {
        setCategories(res.categories);
        setProducts(res.products);
      } else {
        setLoadError(true);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchProducts().then((res) => {
      if (cancelled) return;
      if (res) {
        setCategories(res.categories);
        setProducts(res.products);
      } else {
        setLoadError(true);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const productsByCat = (catId: string) =>
    products.filter((p) => p.categoryId === catId);

  const hasUnsavedDraft = editingKey !== null;
  const guardSwitch = (message = "تجاهل التعديل الحالي؟"): boolean => {
    if (!hasUnsavedDraft) return true;
    return confirm(message);
  };

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const nextOrder =
      categories.length === 0
        ? 1
        : Math.max(...categories.map((c) => c.order)) + 1;
    const created = await createCategoryRemote(name, nextOrder);
    if (created) {
      setCategories([...categories, created]);
      setNewCatName("");
    } else {
      setCategories([
        ...categories,
        { id: `local-${Date.now()}`, name, order: nextOrder },
      ]);
      setNewCatName("");
    }
  };

  const removeCategory = async (id: string) => {
    if (!confirm("حذف هذه الفئة وكل منتجاتها؟ لا يمكن التراجع.")) return;
    setCategories(categories.filter((c) => c.id !== id));
    setProducts(products.filter((p) => p.categoryId !== id));
    await deleteCategoryRemote(id);
  };

  const startEdit = (p: Product) => {
    if (editingKey && editingKey !== p.id) {
      if (!guardSwitch("تجاهل التعديل الحالي والبدء بتعديل آخر؟")) return;
    }
    setEditingKey(p.id);
    setDraft({
      name: p.name,
      price: p.price,
      imageDataUrl: p.imageDataUrl ?? null,
      highlightFlag: !!p.highlightFlag,
    });
    setImageError(null);
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    const name = draft.name.trim();
    if (!name || draft.price < 0) return;
    const updated = await updateProductRemote(editingKey, {
      name,
      price: draft.price,
      imageDataUrl: draft.imageDataUrl,
      highlightFlag: draft.highlightFlag,
    });
    if (updated) {
      setProducts(products.map((p) => (p.id === editingKey ? updated : p)));
    } else {
      setProducts(
        products.map((p) =>
          p.id === editingKey
            ? {
                ...p,
                name,
                price: draft.price,
                imageDataUrl: draft.imageDataUrl ?? undefined,
                highlightFlag: draft.highlightFlag,
              }
            : p,
        ),
      );
    }
    setEditingKey(null);
    setImageError(null);
  };

  const removeProduct = async (id: string) => {
    if (!confirm("حذف هذا المنتج؟")) return;
    setProducts(products.filter((p) => p.id !== id));
    await deleteProductRemote(id);
  };

  const addProduct = async (catId: string) => {
    if (editingKey && !guardSwitch("تجاهل التعديل الحالي وبدء منتج جديد؟"))
      return;
    setEditingKey(`new:${catId}`);
    setDraft(EMPTY_DRAFT);
    setImageError(null);
  };

  const commitAdd = async (catId: string) => {
    const name = draft.name.trim();
    if (!name || draft.price < 0) return;
    const created = await createProductRemote({
      categoryId: catId,
      name,
      price: draft.price,
      imageDataUrl: draft.imageDataUrl,
      highlightFlag: draft.highlightFlag,
    });
    if (created) {
      setProducts([...products, created]);
    } else {
      setProducts([
        ...products,
        {
          id: `local-${Date.now()}`,
          categoryId: catId,
          name,
          price: draft.price,
          imageDataUrl: draft.imageDataUrl ?? undefined,
          highlightFlag: draft.highlightFlag,
        },
      ]);
    }
    setEditingKey(null);
    setImageError(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setImageError(null);
  };

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {loadError ? (
        <div
          className="bg-rust-600/10 border border-rust-600/40 rounded-3xl p-6 text-center"
          role="status"
          dir="rtl"
        >
          <p className="text-rust-300 text-lg mb-3">تعذّر تحميل المنتجات.</p>
          <button
            type="button"
            onClick={reload}
            className="px-5 py-3 rounded-2xl bg-rust-600 hover:bg-rust-500 text-espresso-50 font-bold min-h-[48px] transition-colors duration-200"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : loading ? (
        <p className="text-espresso-400 text-center py-12 text-lg animate-pulse">
          جارٍ التحميل…
        </p>
      ) : categories.length === 0 ? (
        <p className="text-espresso-400 text-center py-12 text-lg">
          لا توجد فئات بعد. أضف فئة للبدء.
        </p>
      ) : null}

      <section className="bg-espresso-900 border border-espresso-800 rounded-3xl p-5">
        <h2 className="font-display text-xl font-bold mb-3">إضافة فئة</h2>
        <div className="flex gap-2">
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="اسم الفئة…"
            className="flex-1 bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-3 text-lg focus:border-copper-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={!newCatName.trim()}
            className="px-6 py-3 rounded-2xl bg-copper-600 disabled:opacity-50 hover:bg-copper-500 text-espresso-50 font-bold min-h-[56px] transition-colors duration-200"
          >
            إضافة
          </button>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {[...categories]
          .sort((a, b) => a.order - b.order)
          .map((c) => {
            const items = productsByCat(c.id);
            return (
              <section
                key={c.id}
                className="bg-espresso-900 border border-espresso-800 rounded-3xl p-5"
              >
                <header className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-display text-lg font-extrabold">{c.name}</h3>
                  <button
                    type="button"
                    onClick={() => removeCategory(c.id)}
                    className="text-sm text-rust-400 hover:text-rust-300 px-2 transition-colors duration-200"
                  >
                    حذف الفئة
                  </button>
                </header>

                <ul className="flex flex-col gap-2 mb-3">
                  {items.length === 0 && (
                    <li className="text-espresso-400 text-sm">
                      لا توجد منتجات في هذه الفئة بعد.
                    </li>
                  )}
                  {items.map((p) => {
                    const isEditing = editingKey === p.id;
                    if (isEditing) {
                      return (
                        <li key={p.id}>
                          <ProductDraftForm
                            draft={draft}
                            setDraft={setDraft}
                            imageError={imageError}
                            setImageError={setImageError}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                          />
                        </li>
                      );
                    }
                    return (
                      <li
                        key={p.id}
                        className="bg-espresso-950 border border-espresso-800 rounded-2xl p-3 flex items-center gap-3"
                      >
                        {p.imageDataUrl ? (
                          <img
                            src={p.imageDataUrl}
                            alt=""
                            className="w-12 h-12 object-contain bg-espresso-900 rounded-xl border border-espresso-800 shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            aria-hidden
                            className="w-12 h-12 rounded-xl border border-espresso-800 bg-espresso-900 shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {p.name}
                            {p.highlightFlag && (
                              <span className="mr-2 px-2 py-0.5 rounded-full bg-rust-600 text-espresso-50 text-xs font-extrabold uppercase tracking-widest">
                                مميز
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-mono text-espresso-300 tabular-nums">
                            {fmtSAR(p.price)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="px-4 py-2 rounded-xl bg-espresso-800 hover:bg-espresso-700 text-sm min-h-[48px] transition-colors duration-200"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          className="px-4 py-2 rounded-xl bg-rust-600/80 hover:bg-rust-600 text-sm text-espresso-50 min-h-[48px] transition-colors duration-200"
                        >
                          حذف
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {editingKey === `new:${c.id}` ? (
                  <ProductDraftForm
                    draft={draft}
                    setDraft={setDraft}
                    imageError={imageError}
                    setImageError={setImageError}
                    onSave={() => commitAdd(c.id)}
                    onCancel={cancelEdit}
                    saveLabel="إضافة"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => addProduct(c.id)}
                    className="w-full py-3 rounded-2xl border-2 border-dashed border-espresso-700 hover:border-copper-500 text-espresso-200 hover:text-copper-400 font-semibold min-h-[56px] transition-colors duration-200"
                  >
                    + منتج جديد
                  </button>
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}

/* ----------------- Draft form (used for both add + edit) ----------------- */

function ProductDraftForm({
  draft,
  setDraft,
  imageError,
  setImageError,
  onSave,
  onCancel,
  saveLabel = "حفظ",
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  imageError: string | null;
  setImageError: (msg: string | null) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onPickFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("الملف ليس صورة.");
      return;
    }
    try {
      const dataUrl = await resizeImageFileToJpegDataUrl(file);
      setDraft({ ...draft, imageDataUrl: dataUrl });
      setImageError(null);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : "تعذّر تجهيز الصورة.",
      );
    }
  }

  return (
    <div className="bg-espresso-950 border border-copper-600/50 rounded-2xl p-3 flex flex-col gap-2">
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="اسم المنتج…"
        className="bg-espresso-900 border border-espresso-700 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-copper-500"
      />
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={0.5}
          inputMode="decimal"
          value={Number.isFinite(draft.price) ? draft.price : 0}
          onChange={(e) =>
            setDraft({ ...draft, price: Number(e.target.value) || 0 })
          }
          placeholder="السعر"
          className="flex-1 bg-espresso-900 border border-espresso-700 rounded-xl px-3 py-2 text-base font-mono focus:outline-none focus:border-copper-500"
        />
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2 rounded-xl bg-copper-600 hover:bg-copper-500 text-espresso-50 font-bold min-h-[48px] transition-colors duration-200"
        >
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-espresso-800 text-espresso-200 min-h-[48px]"
        >
          إلغاء
        </button>
      </div>

      {/* Image picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 rounded-xl bg-espresso-800 hover:bg-espresso-700 text-sm min-h-[40px] transition-colors duration-200"
        >
          {draft.imageDataUrl ? "تغيير الصورة" : "اختر صورة"}
        </button>
        {draft.imageDataUrl && (
          <>
            <img
              src={draft.imageDataUrl}
              alt=""
              className="w-12 h-12 object-contain bg-espresso-900 rounded-xl border border-espresso-800"
            />
            <button
              type="button"
              onClick={() => {
                setDraft({ ...draft, imageDataUrl: null });
                setImageError(null);
              }}
              className="text-sm text-rust-400 hover:text-rust-300 px-2 transition-colors duration-200"
            >
              إزالة الصورة
            </button>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            void onPickFile(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </div>
      {imageError && (
        <p role="alert" className="text-sm text-rust-300">
          {imageError}
        </p>
      )}

      {/* Highlight flag */}
      <label className="flex items-center gap-2 select-none cursor-pointer mt-1">
        <input
          type="checkbox"
          checked={draft.highlightFlag}
          onChange={(e) =>
            setDraft({ ...draft, highlightFlag: e.target.checked })
          }
          className="w-5 h-5 accent-rust-500"
        />
        <span className="text-sm">
          منتج فردي / فاقع اللون{" "}
          <span className="text-xs text-espresso-300">
            (سيُسأل عن اللاعب عند الإضافة)
          </span>
        </span>
      </label>
    </div>
  );
}
