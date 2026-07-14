"use client";

/**
 * Tuya device control screen ("تكييف").
 *
 * Reads stored Tuya creds (Access ID / Secret / region) from Capacitor
 * Preferences, calls `listDevices` on mount, then fetches each device's
 * Data Point (DP) status to decide which controls to render:
 *
 *   • `switch_1`    → on/off toggle (universal across Tuya smart plugs).
 *   • `temp_set`    → +/- temperature stepper (typical AC units).
 *   • `temp_current`→ ambient-temperature pill (read-only).
 *   • `mode`        → (not rendered as a control here — surfaces as a
 *                     status pill only. Full mode selector is out of
 *                     scope for this pass; spec only asked for power +
 *                     temperature stepper.)
 *
 * DP codes are NOT hardcoded into the client outside `switch_1` (see
 * `lib/cloud/tuya.ts`); what shows up on each card is dictated by what
 * the device's status response actually contains, so a wider variety of
 * devices works without code changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Preferences } from "@capacitor/preferences";
import {
  getDeviceStatus,
  listDevices,
  sendCommand,
  setPower,
  TUYA_REGIONS,
  type TuyaConfig,
  type TuyaDevice,
  type TuyaDP,
  type TuyaRegion,
} from "@/lib/cloud/tuya";

const KEY_ACCESS_ID = "tuya.accessId";
const KEY_ACCESS_SECRET = "tuya.accessSecret";
const KEY_REGION = "tuya.region";

const REGION_OPTIONS: TuyaRegion[] = ["us", "eu", "cn", "in"];

const TEMP_MIN = 16;
const TEMP_MAX = 30;
const TEMP_STEP = 1;

type PageState =
  | { kind: "loading" }
  | { kind: "no-creds" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

interface DeviceRow {
  device: TuyaDevice;
  /** DP status map if the per-device status fetch succeeded; null = failed. */
  dps: Map<string, TuyaDP["value"]> | null;
}

export default function ACPage(): JSX.Element {
  const [config, setConfig] = useState<TuyaConfig | null>(null);
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState<Record<string, string>>({}); // deviceId -> action label
  const lastFetchRef = useRef<number>(0);

  const reloadDevices = useCallback(async (cfg: TuyaConfig) => {
    const myFetch = ++lastFetchRef.current;
    setState({ kind: "loading" });
    const listRes = await listDevices(cfg);
    if (myFetch !== lastFetchRef.current) return; // race lost
    if (!listRes.ok) {
      setState({ kind: "error", message: listRes.message });
      setRows([]);
      return;
    }
    if (listRes.data.length === 0) {
      setState({ kind: "ready" });
      setRows([]);
      return;
    }
    setState({ kind: "ready" });
    // Optimistically seed the rows so the grid isn't blank while statuses
    // stream in — each DP fetch updates its own slot.
    setRows(
      listRes.data.map((d) => ({ device: d, dps: null })),
    );
    for (const device of listRes.data) {
      void loadOneStatus(cfg, device, myFetch, listRes.data);
    }
  }, []);

  const loadOneStatus = useCallback(
    async (
      cfg: TuyaConfig,
      device: TuyaDevice,
      fetchId: number,
      currentList: TuyaDevice[],
    ) => {
      const res = await getDeviceStatus(cfg, device.id);
      if (fetchId !== lastFetchRef.current) return;
      if (!res.ok) {
        // Mark this row as "status unknown" but keep the card visible —
        // the power toggle can still work, it just won't pre-fill.
        setRows((prev) => {
          const next = prev.length === currentList.length ? prev : currentList.map((d) => ({ device: d, dps: null }));
          return next.map((row) =>
            row.device.id === device.id ? { ...row, dps: null } : row,
          );
        });
        return;
      }
      const map = new Map<string, TuyaDP["value"]>();
      for (const dp of res.data) map.set(dp.code, dp.value);
      setRows((prev) => {
        const next = prev.length === currentList.length ? prev : currentList.map((d) => ({ device: d, dps: null }));
        return next.map((row) =>
          row.device.id === device.id ? { ...row, dps: map } : row,
        );
      });
    },
    [],
  );

  useEffect(() => {
    (async () => {
      const [a, s, r] = await Promise.all([
        Preferences.get({ key: KEY_ACCESS_ID }),
        Preferences.get({ key: KEY_ACCESS_SECRET }),
        Preferences.get({ key: KEY_REGION }),
      ]);
      const id = a.value?.trim();
      const secret = s.value?.trim();
      const region = r.value && REGION_OPTIONS.includes(r.value as TuyaRegion)
        ? (r.value as TuyaRegion)
        : "us";
      if (!id || !secret) {
        setState({ kind: "no-creds" });
        return;
      }
      const cfg: TuyaConfig = {
        accessId: id,
        accessSecret: secret,
        apiBase: TUYA_REGIONS[region].apiBase,
        region,
      };
      setConfig(cfg);
      await reloadDevices(cfg);
    })();
  }, [reloadDevices]);

  // -- Per-device actions ----------------------------------------------------

  const togglePower = useCallback(
    async (deviceId: string, nextOn: boolean) => {
      if (!config) return;
      setBusy((m) => ({ ...m, [deviceId]: nextOn ? "جاري التشغيل…" : "جاري الإيقاف…" }));
      const r = await setPower(config, deviceId, nextOn);
      setBusy((m) => {
        const { [deviceId]: _, ...rest } = m;
        return rest;
      });
      if (!r.ok) {
        setState({ kind: "error", message: r.message });
        return;
      }
      // Optimistic local mirror so the toggle reads as instant on success.
      setRows((prev) =>
        prev.map((row) =>
          row.device.id === deviceId
            ? {
                ...row,
                dps: new Map(row.dps ?? []).set("switch_1", nextOn),
              }
            : row,
        ),
      );
    },
    [config],
  );

  const adjustTemp = useCallback(
    async (deviceId: string, current: number, delta: number) => {
      if (!config) return;
      const clamped = Math.max(TEMP_MIN, Math.min(TEMP_MAX, current + delta));
      if (clamped === current) return; // already at edge — no-op
      setBusy((m) => ({ ...m, [deviceId]: "جاري الضبط…" }));
      const r = await sendCommand(config, deviceId, [
        { code: "temp_set", value: clamped },
      ]);
      setBusy((m) => {
        const { [deviceId]: _, ...rest } = m;
        return rest;
      });
      if (!r.ok) {
        setState({ kind: "error", message: r.message });
        return;
      }
      setRows((prev) =>
        prev.map((row) =>
          row.device.id === deviceId
            ? {
                ...row,
                dps: new Map(row.dps ?? []).set("temp_set", clamped),
              }
            : row,
        ),
      );
    },
    [config],
  );

  // -- Render -----------------------------------------------------------------

  return (
    <main className="p-4 md:p-8 max-w-7xl mx-auto" dir="rtl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <h1 className="font-display text-3xl md:text-4xl font-extrabold">تكييف</h1>
          <p className="text-espresso-300">
            تحكم بأجهزة WiFi (مكيفات، قوابس ذكية) المرتبطة بحساب Tuya Smart
            أو Smart Life.
          </p>
        </div>
        {config && (
          <button
            type="button"
            onClick={() => void reloadDevices(config)}
            className="flex-shrink-0 min-h-[48px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 text-espresso-50 font-bold border border-espresso-700"
          >
            تحديث
          </button>
        )}
      </header>

      {state.kind === "loading" && (
        <p className="text-espresso-300 text-center py-12 text-lg animate-pulse">
          جارٍ التحميل…
        </p>
      )}

      {state.kind === "no-creds" && (
        <section className="bg-espresso-900 border border-espresso-800 rounded-3xl p-8 flex flex-col gap-4 text-center max-w-2xl mx-auto">
          <p className="text-lg text-espresso-100">
            لم يتم ضبط بيانات Tuya بعد.
          </p>
          <p className="text-sm text-espresso-300 leading-7">
            أضف Access ID وAccess Secret ومنطقة Tuya من شاشة الإعدادات لتفعيل
            التحكم بالأجهزة.
          </p>
          <Link
            href="/settings"
            className="self-center min-h-[48px] inline-flex items-center px-6 rounded-2xl bg-copper-600 hover:bg-copper-500 text-espresso-50 font-extrabold"
          >
            الانتقال إلى الإعدادات
          </Link>
        </section>
      )}

      {state.kind === "error" && (
        <section
          role="alert"
          className="bg-rust-950/40 border border-rust-800 rounded-3xl p-6 max-w-2xl mx-auto flex flex-col gap-3"
        >
          <p className="text-rust-200 font-bold">تعذّر تحميل الأجهزة.</p>
          <p className="text-sm text-rust-200/90 leading-7">{state.message}</p>
          {config && (
            <button
              type="button"
              onClick={() => void reloadDevices(config)}
              className="self-start min-h-[44px] px-5 rounded-2xl bg-rust-700 hover:bg-rust-600 text-espresso-50 font-bold"
            >
              إعادة المحاولة
            </button>
          )}
        </section>
      )}

      {state.kind === "ready" && rows.length === 0 && (
        <p className="text-espresso-400 text-center py-12 text-lg">
          لا توجد أجهزة مرتبطة بهذا الحساب.
        </p>
      )}

      {state.kind === "ready" && rows.length > 0 && (
        <section
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label="أجهزة Tuya"
        >
          {rows.map((row) => (
            <DeviceCard
              key={row.device.id}
              row={row}
              busyAction={busy[row.device.id]}
              onPower={(on) => void togglePower(row.device.id, on)}
              onTempDelta={(delta) => {
                const cur =
                  typeof row.dps?.get("temp_set") === "number"
                    ? (row.dps!.get("temp_set") as number)
                    : TEMP_MIN;
                void adjustTemp(row.device.id, cur, delta);
              }}
            />
          ))}
        </section>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------------ */
/* Per-device card                                                          */
/* ------------------------------------------------------------------------ */

function DeviceCard({
  row,
  busyAction,
  onPower,
  onTempDelta,
}: {
  row: DeviceRow;
  busyAction: string | undefined;
  onPower: (on: boolean) => void;
  onTempDelta: (delta: number) => void;
}): JSX.Element {
  const { device, dps } = row;
  const powerOn = dps?.get("switch_1") === true;
  const tempSet =
    typeof dps?.get("temp_set") === "number"
      ? (dps!.get("temp_set") as number)
      : null;
  const tempCurrent =
    typeof dps?.get("temp_current") === "number"
      ? (dps!.get("temp_current") as number)
      : null;
  const mode = typeof dps?.get("mode") === "string" ? (dps!.get("mode") as string) : null;
  const supportsTemp = tempSet !== null || tempCurrent !== null;
  const disabled = busyAction !== undefined;

  return (
    <article
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-5 flex flex-col gap-4 shadow-lg"
      aria-label={`جهاز ${device.name || device.id}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <h3 className="font-display text-xl font-extrabold text-espresso-50 truncate">
            {device.name || device.id}
          </h3>
          {device.productName && (
            <p className="text-xs text-espresso-400 truncate" dir="ltr">
              {device.productName}
            </p>
          )}
        </div>
        <OnlinePill online={device.online} />
      </header>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-widest text-espresso-300">
            الطاقة
          </span>
          <span
            className={`text-2xl font-extrabold ${
              powerOn ? "text-copper-300" : "text-espresso-400"
            }`}
          >
            {powerOn ? "قيد التشغيل" : "مطفأ"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onPower(!powerOn)}
          disabled={disabled || !device.online}
          aria-pressed={powerOn}
          className={`min-h-[56px] min-w-[120px] px-5 rounded-2xl font-extrabold text-lg border transition-colors duration-200 ${
            powerOn
              ? "bg-copper-700 hover:bg-copper-600 text-espresso-50 border-copper-700"
              : "bg-espresso-800 hover:bg-espresso-700 text-espresso-100 border-espresso-700"
          } disabled:opacity-50`}
        >
          {busyAction ?? (powerOn ? "إيقاف" : "تشغيل")}
        </button>
      </div>

      {(tempSet !== null || tempCurrent !== null) && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-espresso-950 border border-espresso-800 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-widest text-espresso-300">
              درجة الحرارة
            </span>
            <span className="font-mono text-3xl font-black text-copper-300 tabular-nums" dir="ltr">
              {tempSet ?? tempCurrent}°C
            </span>
          </div>
          {tempSet !== null && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onTempDelta(-TEMP_STEP)}
                disabled={disabled || !device.online || tempSet <= TEMP_MIN}
                aria-label="خفض درجة الحرارة"
                className="min-h-[48px] min-w-[48px] rounded-full bg-espresso-800 hover:bg-espresso-700 disabled:opacity-40 text-espresso-50 text-2xl font-extrabold border border-espresso-700"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => onTempDelta(TEMP_STEP)}
                disabled={disabled || !device.online || tempSet >= TEMP_MAX}
                aria-label="رفع درجة الحرارة"
                className="min-h-[48px] min-w-[48px] rounded-full bg-espresso-800 hover:bg-espresso-700 disabled:opacity-40 text-espresso-50 text-2xl font-extrabold border border-espresso-700"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {supportsTemp && tempCurrent !== null && (
          <span className="px-3 py-1 rounded-full bg-espresso-950 border border-espresso-800 text-xs text-espresso-200 font-mono" dir="ltr">
            الحالية: {tempCurrent}°C
          </span>
        )}
        {mode && (
          <span
            className="px-3 py-1 rounded-full bg-espresso-950 border border-espresso-800 text-xs text-espresso-200 font-mono"
            title="وضع الجهاز الحالي (للقراءة فقط)"
          >
            الوضع: {mode}
          </span>
        )}
      </div>
    </article>
  );
}

function OnlinePill({ online }: { online: boolean }): JSX.Element {
  return (
    <span
      className={`flex-shrink-0 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
        online
          ? "bg-copper-950/40 border-copper-700 text-copper-300"
          : "bg-espresso-950 border-espresso-800 text-espresso-400"
      }`}
      title={online ? "متصل بالإنترنت" : "غير متصل"}
    >
      <span
        aria-hidden
        className={`w-2 h-2 rounded-full ${
          online ? "bg-copper-400" : "bg-espresso-600"
        }`}
      />
      {online ? "متصل" : "غير متصل"}
    </span>
  );
}
