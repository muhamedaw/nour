"use client";

import { useCallback, useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import {
  clearStoredToken,
  listDevices,
  TUYA_REGIONS,
  type TuyaConfig,
  type TuyaRegion,
} from "@/lib/cloud/tuya";

const KEY_ACCESS_ID = "tuya.accessId";
const KEY_ACCESS_SECRET = "tuya.accessSecret";
const KEY_REGION = "tuya.region";

const REGION_OPTIONS: TuyaRegion[] = ["us", "eu", "cn", "in"];

type BusyKind = "test" | null;

export default function TuyaSettings(): JSX.Element {
  const [accessId, setAccessId] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [region, setRegion] = useState<TuyaRegion>("us");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing creds on mount.
  useEffect(() => {
    (async () => {
      const [a, s, r] = await Promise.all([
        Preferences.get({ key: KEY_ACCESS_ID }),
        Preferences.get({ key: KEY_ACCESS_SECRET }),
        Preferences.get({ key: KEY_REGION }),
      ]);
      if (a.value) setAccessId(a.value);
      if (s.value) setAccessSecret(s.value);
      if (r.value && REGION_OPTIONS.includes(r.value as TuyaRegion)) {
        setRegion(r.value as TuyaRegion);
      }
    })();
  }, []);

  const buildConfig = useCallback((): TuyaConfig | null => {
    if (!accessId.trim() || !accessSecret.trim()) return null;
    return {
      accessId: accessId.trim(),
      accessSecret: accessSecret.trim(),
      apiBase: TUYA_REGIONS[region].apiBase,
      region,
    };
  }, [accessId, accessSecret, region]);

  async function saveCreds(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!accessId.trim() || !accessSecret.trim()) {
      setErrorMsg("الرجاء إدخال Access ID وAccess Secret.");
      return;
    }
    await Promise.all([
      Preferences.set({
        key: KEY_ACCESS_ID,
        value: accessId.trim(),
      }),
      Preferences.set({
        key: KEY_ACCESS_SECRET,
        value: accessSecret.trim(),
      }),
      Preferences.set({
        key: KEY_REGION,
        value: region,
      }),
    ]);
    // Clear the cached token: the previous token was tied to the previous
    // (possibly different) project / secret, and an old-credential token
    // would falsely "look valid" if reused. Force a fresh grant next call.
    const cfg = buildConfig();
    if (cfg) {
      try {
        await clearStoredToken(cfg);
      } catch {
        /* not fatal — the next ensureAccessToken() will refresh anyway */
      }
    }
    setSuccessMsg("تم حفظ بيانات Tuya.");
  }

  async function testConnection(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    const cfg = buildConfig();
    if (!cfg) {
      setErrorMsg("احفظ بيانات Tuya أولًا ثم اختبر الاتصال.");
      return;
    }
    setBusy("test");
    try {
      const r = await listDevices(cfg);
      if (r.ok) {
        setSuccessMsg(
          `الاتصال ناجح (${r.data.length} جهاز مرتبط بهذا الحساب).`,
        );
      } else {
        setErrorMsg(`فشل الاتصال: ${r.message}`);
      }
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <section
      dir="rtl"
      aria-labelledby="tuya-heading"
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-6 md:p-8 flex flex-col gap-5 shadow-xl"
    >
      <header className="flex flex-col gap-2">
        <h2
          id="tuya-heading"
          className="font-display text-xl md:text-2xl font-extrabold text-copper-400"
        >
          التحكم بالأجهزة الذكية (Tuya / Smart Life)
        </h2>
        <p className="text-sm text-espresso-300 leading-7">
          اربط حساب Tuya Cloud لتفعيل تشغيل وإطفاء مكيفات وأجهزة WiFi من
          هذه الشاشة. هذا التكامل منفصل عن الإعدادات الأخرى ولا يشارك أي
          بيانات معها.
        </p>
      </header>

      <ol className="text-sm text-espresso-200 leading-7 list-decimal pr-5 flex flex-col gap-2">
        <li>
          على هاتفك، ثبّت تطبيق{" "}
          <span className="font-mono text-copper-300">Tuya Smart</span> أو{" "}
          <span className="font-mono text-copper-300">Smart Life</span>{" "}
          واقرن كل جهاز تريد التحكم به (مكيف، قابس ذكي، مفتاح…).
        </li>
        <li>
          سجّل حسابًا مجانيًا على{" "}
          <a
            href="https://iot.tuya.com"
            target="_blank"
            rel="noreferrer"
            className="text-copper-300 underline underline-offset-4 hover:text-copper-200"
          >
            iot.tuya.com
          </a>{" "}
          وأنشئ مشروعًا سحابيًا، ثم انسخ الـ{" "}
          <span className="font-mono">Access ID</span> والـ{" "}
          <span className="font-mono">Access Secret</span> والصقهما هنا.
        </li>
        <li>
          اختر <strong>المنطقة</strong> المناسبة لموقع حساب Tuya (أمريكا،
          أوروبا، الصين، الهند).
        </li>
        <li>
          اضغط <strong>حفظ</strong> ثم <strong>اختبار الاتصال</strong>{" "}
          للتأكد إن كان ربط حسابك Cloud بالأجهزة صحيحًا.
        </li>
      </ol>

      <div className="grid gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-espresso-200">Access ID</span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={accessId}
            onChange={(e) => setAccessId(e.target.value)}
            placeholder="مثال: tt8dxxxxxxxxxxxxxxxx"
            className="min-h-[48px] px-4 rounded-2xl bg-espresso-950 border border-espresso-700 text-espresso-50 font-mono text-sm focus:outline-none focus:border-copper-500"
            dir="ltr"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-espresso-200">Access Secret</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={accessSecret}
            onChange={(e) => setAccessSecret(e.target.value)}
            placeholder="سرّ التطبيق"
            className="min-h-[48px] px-4 rounded-2xl bg-espresso-950 border border-espresso-700 text-espresso-50 font-mono text-sm focus:outline-none focus:border-copper-500"
            dir="ltr"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-espresso-200">المنطقة</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as TuyaRegion)}
            className="min-h-[48px] px-4 rounded-2xl bg-espresso-950 border border-espresso-700 text-espresso-50 text-sm focus:outline-none focus:border-copper-500"
            dir="ltr"
          >
            {REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {TUYA_REGIONS[r].label}
              </option>
            ))}
          </select>
          <span className="text-xs text-espresso-400 font-mono mt-1" dir="ltr">
            {TUYA_REGIONS[region].apiBase}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveCreds}
          disabled={disabled}
          className="min-h-[48px] px-5 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-espresso-50 font-bold border border-copper-700"
        >
          حفظ
        </button>
        <button
          type="button"
          onClick={testConnection}
          disabled={disabled || !accessId.trim() || !accessSecret.trim()}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700"
        >
          {busy === "test" ? "جاري الاختبار…" : "اختبار الاتصال"}
        </button>
      </div>

      {successMsg && (
        <p
          role="status"
          className="text-sm text-copper-300 bg-copper-950/40 border border-copper-800 rounded-2xl px-4 py-3"
        >
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p
          role="alert"
          className="text-sm text-rust-200 bg-rust-950/40 border border-rust-800 rounded-2xl px-4 py-3"
        >
          {errorMsg}
        </p>
      )}
    </section>
  );
}
