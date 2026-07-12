"use client";

import { useEffect, useState } from "react";
import { initLocalDb, ensureStaffPasswordSeeded, checkStaffPassword } from "@/lib/localdb";
import { isUnlocked, setUnlocked } from "@/lib/localauth";

type Status = "loading" | "locked" | "unlocked";

/**
 * Client-side replacement for the old middleware.ts + server session cookie.
 * There's no server anymore to gate requests, so the gate lives entirely in
 * the WebView: on mount, initialize the local DB, seed a default password
 * hash if none exists yet, then check the localStorage "unlocked" flag. If
 * unlocked, render the app. If not, render a password form in place — no
 * navigation needed, this wraps the whole app at the root layout.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initLocalDb();
      await ensureStaffPasswordSeeded();
      if (cancelled) return;
      setStatus(isUnlocked() ? "unlocked" : "locked");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const ok = await checkStaffPassword(password);
    setBusy(false);
    if (!ok) {
      setError("كلمة المرور غير صحيحة");
      return;
    }
    setUnlocked();
    setPassword("");
    setStatus("unlocked");
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center" dir="rtl">
        <p className="text-espresso-400 animate-pulse text-lg">جارٍ التحميل…</p>
      </main>
    );
  }

  if (status === "locked") {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-espresso-900 border border-espresso-800 rounded-3xl p-6 flex flex-col gap-4"
        >
          <h1 className="font-display text-2xl font-bold text-center">تسجيل الدخول</h1>
          <p className="text-espresso-300 text-sm text-center">
            كلمة مرور الموظفين المشتركة
          </p>
          {error && (
            <p className="text-rust-400 text-sm text-center" role="alert">
              {error}
            </p>
          )}
          <input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
            className="bg-espresso-950 border border-espresso-700 rounded-2xl px-4 py-3 text-lg focus:border-copper-500 focus:outline-none min-h-[56px]"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-3 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-60 text-espresso-50 font-bold min-h-[56px] transition-colors duration-200"
          >
            {busy ? "جارٍ التحقق…" : "دخول"}
          </button>
        </form>
      </main>
    );
  }

  return <>{children}</>;
}
