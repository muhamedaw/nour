"use client";

import { useEffect, useState } from "react";
import { AREA_THEME, fmtSAR } from "@/components/domain";
import { fetchAreasConfig, patchAreaConfig } from "@/components/floor/api-client";
import { AREA_AR, AREAS_ORDER } from "@/components/dashboard/report-aggregations";
import type { AreaConfig, AreaType } from "@/lib/types";

type RowState = "idle" | "saving" | "saved" | "error";

/**
 * Editable hourly rate per area, backed by `GET/PATCH /api/settings/areas`.
 * Cards has no time-based billing (`hourlyRate: null`) so its row shows a
 * fixed "بدون احتساب وقت" label instead of an input — matches the same
 * `hourlyRate === null` convention used everywhere else (TimedSessionView,
 * FloorHeader, computeBill).
 *
 * A saved rate takes effect immediately: the close route reads the DB value
 * live (not a hardcoded constant), so the very next session closed in that
 * area bills at the new rate.
 */
export default function AreaSettingsPanel() {
  const [settings, setSettings] = useState<AreaConfig[] | null>(null);
  const [drafts, setDrafts] = useState<Record<AreaType, string>>({
    snooker: "",
    cards: "",
    playstation: "",
  });
  const [rowState, setRowState] = useState<Record<AreaType, RowState>>({
    snooker: "idle",
    cards: "idle",
    playstation: "idle",
  });
  const [rowError, setRowError] = useState<Record<AreaType, string | null>>({
    snooker: null,
    cards: null,
    playstation: null,
  });

  const load = () => {
    fetchAreasConfig().then((list) => {
      if (!list) return;
      setSettings(list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const a of list) {
          if (a.hourlyRate !== null) next[a.area] = String(a.hourlyRate);
        }
        return next;
      });
    });
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (area: AreaType) => {
    const raw = drafts[area].trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value <= 0) {
      setRowState((s) => ({ ...s, [area]: "error" }));
      setRowError((s) => ({ ...s, [area]: "أدخل رقم أكبر من صفر." }));
      return;
    }
    setRowState((s) => ({ ...s, [area]: "saving" }));
    setRowError((s) => ({ ...s, [area]: null }));
    const result = await patchAreaConfig({ area, hourlyRate: value });
    if (!result.ok) {
      setRowState((s) => ({ ...s, [area]: "error" }));
      setRowError((s) => ({ ...s, [area]: result.message }));
      return;
    }
    setSettings((prev) =>
      prev ? prev.map((a) => (a.area === area ? result.area : a)) : prev,
    );
    setRowState((s) => ({ ...s, [area]: "saved" }));
    setTimeout(() => {
      setRowState((s) => (s[area] === "saved" ? { ...s, [area]: "idle" } : s));
    }, 2000);
  };

  return (
    <section
      dir="rtl"
      className="rounded-3xl border border-espresso-800 bg-espresso-900 p-5 md:p-6"
    >
      <header className="mb-4">
        <h2 className="font-display text-xl md:text-2xl font-bold">سعر الساعة لكل منطقة</h2>
        <p className="text-sm text-espresso-300 mt-1">
          يُطبَّق فورًا على أي جلسة تُغلق بعد الحفظ.
        </p>
      </header>

      {settings === null ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AREAS_ORDER.map((a) => (
            <div key={a} className="h-24 rounded-2xl bg-espresso-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AREAS_ORDER.map((a) => {
            const cfg = settings.find((s) => s.area === a);
            const theme = AREA_THEME[a];
            const isProductOnly = cfg?.hourlyRate === null;
            const state = rowState[a];
            return (
              <div
                key={a}
                className="rounded-2xl border border-espresso-800 p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[theme.accentBg, "w-2 h-6 rounded-full"].join(" ")}
                    aria-hidden
                  />
                  <h3 className="font-display font-bold">{AREA_AR[a]}</h3>
                </div>

                {isProductOnly ? (
                  <p className="text-sm text-espresso-400">بدون احتساب وقت (منتجات فقط)</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step="0.5"
                        inputMode="decimal"
                        value={drafts[a]}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [a]: e.target.value }))
                        }
                        disabled={state === "saving"}
                        aria-label={`سعر الساعة لمنطقة ${AREA_AR[a]}`}
                        className="flex-1 min-w-0 bg-espresso-950 border border-espresso-700 rounded-xl px-3 py-2 text-lg font-mono focus:outline-none focus:border-copper-500 disabled:opacity-60"
                      />
                      <span className="text-sm text-espresso-300 shrink-0">₪ / ساعة</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => save(a)}
                      disabled={state === "saving"}
                      className={[
                        "min-h-[44px] rounded-xl font-bold text-sm transition-colors disabled:opacity-60",
                        state === "saved"
                          ? "bg-copper-600 text-espresso-50"
                          : state === "error"
                            ? "bg-rust-600/80 hover:bg-rust-600 text-espresso-50"
                            : "bg-espresso-800 hover:bg-espresso-700 text-espresso-50",
                      ].join(" ")}
                    >
                      {state === "saving"
                        ? "جاري الحفظ…"
                        : state === "saved"
                          ? "تم الحفظ ✓"
                          : "حفظ"}
                    </button>
                    {cfg && (
                      <p className="text-xs text-espresso-400">
                        السعر الحالي: {fmtSAR(cfg.hourlyRate ?? 0)} / ساعة
                      </p>
                    )}
                    {rowError[a] && (
                      <p className="text-xs text-rust-400" role="alert">
                        {rowError[a]}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
