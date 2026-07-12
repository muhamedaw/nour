"use client";

import { useEffect, useState } from "react";
import { fetchAreasConfig } from "@/components/floor/api-client";
import AreaSettingsForm from "./AreaSettingsForm";
import type { AreaConfig } from "@/lib/types";

/**
 * Settings page client view.
 *  • On mount: GET /api/settings/areas.
 *  • Lays out one AreaSettingsForm per area.
 *  • Loading skeleton + error-state retry, mirroring the rest of the app.
 *
 * The page is intentionally not linked from the top nav yet — another
 * team owns nav additions right now. Direct navigation to /settings
 * works regardless.
 */
export default function SettingsView() {
  const [areas, setAreas] = useState<AreaConfig[] | null>(null);
  const [loadState, setLoadState] = useState<
    "loading" | "ok" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    fetchAreasConfig().then((list) => {
      if (cancelled) return;
      if (list === null) {
        setAreas([]);
        setLoadState("error");
        return;
      }
      setAreas(list);
      setLoadState("ok");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = () => {
    setLoadState("loading");
    fetchAreasConfig().then((list) => {
      if (list === null) {
        setLoadState("error");
        setAreas([]);
        return;
      }
      setAreas(list);
      setLoadState("ok");
    });
  };

  if (loadState === "loading") {
    return (
      <div className="flex flex-col gap-5" dir="rtl">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-espresso-900 border border-espresso-800 rounded-3xl p-6 animate-pulse"
          >
            <div className="h-7 w-40 rounded bg-espresso-800 mb-4" />
            <div className="h-10 w-full rounded bg-espresso-800 mb-3" />
            <div className="h-10 w-full rounded bg-espresso-800 mb-3" />
            <div className="h-10 w-full rounded bg-espresso-800 mb-3" />
          </div>
        ))}
      </div>
    );
  }

  if (loadState === "error" || !areas || areas.length === 0) {
    return (
      <div
        dir="rtl"
        className="bg-rust-600/10 border border-rust-600/40 rounded-3xl p-6 md:p-8 text-center"
        role="status"
      >
        <p className="text-rust-300 text-lg mb-3">تعذّر تحميل الإعدادات.</p>
        <button
          type="button"
          onClick={reload}
          className="px-6 py-3 rounded-2xl bg-rust-600 hover:bg-rust-500 text-espresso-50 font-bold min-h-[48px] transition-colors duration-200"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <header>
        <h2 className="font-display text-xl md:text-2xl font-extrabold mb-1">المناطق</h2>
        <p className="text-sm text-espresso-300">
          عدّل عدد الطاولات أو السعر بالساعة أو اسم المنطقة. يتم الحفظ
          منطقياً لكل منطقة على حدة — اضغط &quot;حفظ&quot; بعد كل تعديل.
        </p>
      </header>
      {areas.map((a) => (
        <AreaSettingsForm
          key={a.area}
          initial={a}
          onSaved={(next) => {
            setAreas((prev) =>
              prev ? prev.map((p) => (p.area === next.area ? next : p)) : prev,
            );
          }}
        />
      ))}
    </div>
  );
}
