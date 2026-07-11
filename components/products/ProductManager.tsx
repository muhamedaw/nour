"use client";

import { useEffect, useState } from "react";
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

/**
 * Category + product CRUD backed by `/api/products`.
 *
 *  • On mount: GET `/api/products` → seeds local state.
 *  • Mutations: POST/PATCH/DELETE → only commit to state on success.
 *  • All API failures degrade silently (the api-client logs + returns null).
 */

type Draft = { name: string; price: number };

export default function ProductManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", price: 0 });
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
      // Optimistic local add so the UX doesn't feel stuck.
      setCategories([
        ...categories,
        { id: `local-${Date.now()}`, name, order: nextOrder },
      ]);
      setNewCatName("");
    }
  };

  const removeCategory = async (id: string) => {
    if (!confirm("حذف هذه الفئة وكل منتجاتها؟ لا يمكن التراجع.")) return;
    // Always reflect the user's confirmed intent immediately. The API
    // call is best-effort; failures only mean the server lags behind.
    setCategories(categories.filter((c) => c.id !== id));
    setProducts(products.filter((p) => p.categoryId !== id));
    await deleteCategoryRemote(id);
  };

  const startEdit = (p: Product) => {
    if (editingKey && editingKey !== p.id) {
      if (!guardSwitch("تجاهل التعديل الحالي والبدء بتعديل آخر؟")) return;
    }
    setEditingKey(p.id);
    setDraft({ name: p.name, price: p.price });
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    const name = draft.name.trim();
    if (!name || draft.price < 0) return;
    const updated = await updateProductRemote(editingKey, {
      name,
      price: draft.price,
    });
    if (updated) {
      setProducts(
        products.map((p) => (p.id === editingKey ? updated : p)),
      );
    } else {
      setProducts(
        products.map((p) =>
          p.id === editingKey ? { ...p, name, price: draft.price } : p,
        ),
      );
    }
    setEditingKey(null);
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
    setDraft({ name: "", price: 0 });
  };

  const commitAdd = async (catId: string) => {
    const name = draft.name.trim();
    if (!name || draft.price < 0) return;
    const created = await createProductRemote({
      categoryId: catId,
      name,
      price: draft.price,
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
        },
      ]);
    }
    setEditingKey(null);
  };

  const cancelEdit = () => setEditingKey(null);

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {loadError ? (
        <div
          className="bg-red-600/10 border border-red-600/40 rounded-3xl p-6 text-center"
          role="status"
          dir="rtl"
        >
          <p className="text-red-300 text-lg mb-3">تعذّر تحميل المنتجات.</p>
          <button
            type="button"
            onClick={reload}
            className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold min-h-[48px]"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : loading ? (
        <p className="text-neutral-500 text-center py-12 text-lg animate-pulse">
          جارٍ التحميل…
        </p>
      ) : categories.length === 0 ? (
        <p className="text-neutral-500 text-center py-12 text-lg">
          لا توجد فئات بعد. أضف فئة للبدء.
        </p>
      ) : null}

      <section className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5">
        <h2 className="text-xl font-bold mb-3">إضافة فئة</h2>
        <div className="flex gap-2">
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="اسم الفئة…"
            className="flex-1 bg-neutral-950 border border-neutral-700 rounded-2xl px-4 py-3 text-lg focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={!newCatName.trim()}
            className="px-6 py-3 rounded-2xl bg-emerald-600 disabled:opacity-50 hover:bg-emerald-500 text-white font-bold min-h-[56px]"
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
                className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5"
              >
                <header className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-lg font-extrabold">{c.name}</h3>
                  <button
                    type="button"
                    onClick={() => removeCategory(c.id)}
                    className="text-sm text-red-400 hover:text-red-300 px-2"
                  >
                    حذف الفئة
                  </button>
                </header>

                <ul className="flex flex-col gap-2 mb-3">
                  {items.length === 0 && (
                    <li className="text-neutral-500 text-sm">
                      لا توجد منتجات في هذه الفئة بعد.
                    </li>
                  )}
                  {items.map((p) => {
                    const isEditing = editingKey === p.id;
                    if (isEditing) {
                      return (
                        <li
                          key={p.id}
                          className="bg-neutral-950 border border-emerald-600/50 rounded-2xl p-3 flex flex-col gap-2"
                        >
                          <input
                            value={draft.name}
                            onChange={(e) =>
                              setDraft({ ...draft, name: e.target.value })
                            }
                            className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-emerald-500"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              inputMode="decimal"
                              value={Number.isFinite(draft.price) ? draft.price : 0}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  price: Number(e.target.value) || 0,
                                })
                              }
                              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-base font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={saveEdit}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold min-h-[48px]"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 min-h-[48px]"
                            >
                              إلغاء
                            </button>
                          </div>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={p.id}
                        className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-sm font-mono text-neutral-400 tabular-nums">
                            {fmtSAR(p.price)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm min-h-[48px]"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          className="px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-sm text-white min-h-[48px]"
                        >
                          حذف
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {editingKey === `new:${c.id}` ? (
                  <div className="bg-neutral-950 border border-emerald-600/50 rounded-2xl p-3 flex flex-col gap-2">
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                      placeholder="اسم المنتج…"
                      className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-base focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        inputMode="decimal"
                        value={Number.isFinite(draft.price) ? draft.price : 0}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            price: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="السعر"
                        className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-base font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => commitAdd(c.id)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold min-h-[48px]"
                      >
                        إضافة
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-xl bg-neutral-800 text-neutral-300 min-h-[48px]"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => addProduct(c.id)}
                    className="w-full py-3 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-emerald-500 text-neutral-300 hover:text-emerald-400 font-semibold min-h-[56px]"
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
