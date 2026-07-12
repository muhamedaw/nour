"use client";

import { useState } from "react";
import { fmtSAR } from "@/components/domain";
import { patchAreaConfig } from "@/components/floor/api-client";
import type { AreaConfig, AreaType } from "@/lib/types";

/**
 * Editable form for one area's settings.
 *  • `label` — text input.
 *  • `tableCount` — positive integer input.
 *  • `hourlyRate` — number input OR the "بدون وقت" toggle which sets it
 *    to `null` (the Cards-style product-only area).
 *  • One save button per area; clear per-area success/error feedback.
 *
 * PATCHes `/api/settings/areas`. The server may 400 if tableCount is
 * reduced below a table that has an open session — that message is
 * piped straight through to the user-facing banner.
 */
export interface AreaSettingsFormProps {
  initial: AreaConfig;
  /** Called after a successful PATCH so the parent can re-render. */
  onSaved: (next: AreaConfig) => void;
}

export default function AreaSettingsForm({
  initial,
  onSaved,
}: AreaSettingsFormProps) {
  const [label, setLabel] = useState(initial.label);
  const [tableCount, setTableCount] = useState<number>(initial.tableCount);
  const [productOnly, setProductOnly] = useState<boolean>(
    initial.hourlyRate === null,
  );
  const [hourlyRate, setHourlyRate] = useState<number>(
    initial.hourlyRate ?? 0,
  );

  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Reset dirty flag on initial sync (in case parent re-renders with
  // fresh server data — we treat it as a non-dirty reset).
  if (
    !dirty &&
    (label !== initial.label ||
      tableCount !== initial.tableCount ||
      productOnly !== (initial.hourlyRate === null) ||
      (!productOnly && hourlyRate !== (initial.hourlyRate ?? 0)))
  ) {
    // re-derive from a controlled value; simple no-op guard
  }

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  async function handleSave() {
    setError(null);
    setSavedAt(null);

    if (!label.trim()) {
      setError("الاسم لا يمكن أن يكون فارغاً.");
      return;
    }
    if (!Number.isInteger(tableCount) || tableCount < 1) {
      setError("عدد الطاولات يجب أن يكون رقماً صحيحاً موجباً.");
      return;
    }
    if (!productOnly && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      setError("السعر بالساعة يجب أن يكون رقماً غير سالب.");
      return;
    }

    setBusy(true);
    const res = await patchAreaConfig({
      area: initial.area,
      label: label.trim(),
      tableCount,
      hourlyRate: productOnly ? null : hourlyRate,
    });
    setBusy(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }
    onSaved(res.area);
    setDirty(false);
    setSavedAt(Date.now());
  }

  return (
    <section
      dir="rtl"
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-5 md:p-6 flex flex-col gap-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-xl md:text-2xl font-extrabold">
          {AREAS_AR[initial.area]}
        </h3>
        <span className="text-xs uppercase tracking-widest text-espresso-400 font-mono">
          {initial.area}
        </span>
      </header>

      <Field
        label="اسم المنطقة"
        hint="يظهر في شاشة الأرضية وفي رأس جلسة هذه المنطقة."
      >
        <input
          type="text"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            markDirty();
          }}
          className="w-full bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-3 text-lg focus:border-copper-500 focus:outline-none"
        />
      </Field>

      <Field
        label="عدد الطاولات"
        hint="رقم صحيح موجب. لا يمكن تقليله تحت رقم طاولة عليها جلسة مفتوحة."
      >
        <input
          type="number"
          min={1}
          step={1}
          value={Number.isFinite(tableCount) ? tableCount : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            setTableCount(Number.isFinite(n) ? Math.max(1, Math.floor(n)) : n);
            markDirty();
          }}
          className="w-full bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-3 text-lg font-mono focus:border-copper-500 focus:outline-none"
          dir="ltr"
        />
      </Field>

      <Field
        label="السعر بالساعة"
        hint="اتركه فارغاً فوق «بدون وقت» لمناطق Cards مثلاً."
      >
        <div className="flex items-start gap-3 flex-wrap">
          <label className="flex items-center gap-2 min-h-[48px] px-3 rounded-2xl bg-espresso-950 border border-espresso-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={productOnly}
              onChange={(e) => {
                setProductOnly(e.target.checked);
                markDirty();
              }}
              className="w-5 h-5 accent-copper-500"
            />
            <span className="text-sm">بدون وقت</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            disabled={productOnly}
            value={Number.isFinite(hourlyRate) ? hourlyRate : 0}
            onChange={(e) => {
              const n = Number(e.target.value);
              setHourlyRate(Number.isFinite(n) ? n : 0);
              markDirty();
            }}
            className="flex-1 min-w-[180px] bg-espresso-950 border border-espresso-700 disabled:opacity-50 rounded-2xl px-4 py-3 text-lg font-mono focus:border-copper-500 focus:outline-none"
            dir="ltr"
          />
          {!productOnly && Number.isFinite(hourlyRate) && hourlyRate >= 0 && (
            <span className="px-3 py-2 self-center rounded-xl bg-espresso-800 text-sm font-mono text-espresso-200">
              {fmtSAR(hourlyRate)} / ساعة
            </span>
          )}
        </div>
      </Field>

      {error && (
        <div
          role="alert"
          dir="rtl"
          className="bg-rust-600/15 border border-rust-600/40 rounded-2xl p-3 text-rust-200 text-sm"
        >
          {error}
        </div>
      )}
      {savedAt && !dirty && (
        <div
          role="status"
          dir="rtl"
          className="bg-copper-600/15 border border-copper-600/40 rounded-2xl p-3 text-copper-300 text-sm"
        >
          تم الحفظ.
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || !dirty}
          className="min-h-[48px] px-5 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-espresso-50 text-base font-bold transition-colors duration-200"
        >
          {busy ? "جاري الحفظ…" : "حفظ"}
        </button>
      </div>
    </section>
  );
}

/* --------------- Small helpers --------------- */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-widest text-espresso-300">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-espresso-400">{hint}</span>}
    </label>
  );
}

const AREAS_AR: Record<AreaType, string> = {
  snooker: "سنوكر",
  cards: "Cards",
  playstation: "بلايستيشن",
};
