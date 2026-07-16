"use client";

import { useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";
import { uploadEncryptedBackup } from "@/lib/cloud/backup";
import { checkForUpdate } from "@/lib/cloud/ota";
import { getCurrentStaffPassword } from "@/lib/localdb";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_BUCKET,
} from "@/lib/cloud/defaults";
import type { CloudBackupLogEntry } from "@/components/cloud/CloudBackupScheduler";

const KEY_LAST_BACKUP_AT = "cloud.lastBackupAt";
const KEY_LAST_LOG = "cloud.lastLog";

const CLOUD_CONFIG = {
  supabaseUrl: SUPABASE_URL,
  apiKey: SUPABASE_ANON_KEY,
  bucket: SUPABASE_BUCKET,
};

type BusyKind = "backup" | "update" | null;

export default function CloudBackupStatus(): JSX.Element {
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [log, setLog] = useState<CloudBackupLogEntry[]>([]);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [lb, ll] = await Promise.all([
        Preferences.get({ key: KEY_LAST_BACKUP_AT }),
        Preferences.get({ key: KEY_LAST_LOG }),
      ]);
      if (lb.value) setLastBackupAt(lb.value);
      if (ll.value) {
        try {
          const parsed = JSON.parse(ll.value);
          if (Array.isArray(parsed)) setLog(parsed as CloudBackupLogEntry[]);
        } catch {
          // Corrupt log — start fresh rather than blocking the page.
        }
      }
      try {
        const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
        const { bundle } = await CapacitorUpdater.current();
        setAppVersion(bundle.version);
      } catch {
        // Not running under Capacitor — no version to show.
      }
    })();
  }, []);

  async function backupNow(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy("backup");
    try {
      const password = getCurrentStaffPassword();
      if (!password) {
        setErrorMsg(
          "كلمة المرور غير متاحة حاليًا — أعد تسجيل الدخول ثم حاول مجددًا.",
        );
        return;
      }
      const result = await uploadEncryptedBackup(CLOUD_CONFIG, password);
      const at = new Date().toISOString();
      const entry: CloudBackupLogEntry = result.ok
        ? {
            at,
            kind: "success",
            message: "تم رفع نسخة احتياطية مشفّرة إلى السحابة.",
          }
        : { at, kind: "error", message: result.message };
      const next = [entry, ...log].slice(0, 10);
      setLog(next);
      await Preferences.set({ key: KEY_LAST_LOG, value: JSON.stringify(next) });
      if (result.ok) {
        setLastBackupAt(at);
        await Preferences.set({ key: KEY_LAST_BACKUP_AT, value: at });
        setSuccessMsg("تم رفع النسخة الاحتياطية بنجاح.");
      } else {
        setErrorMsg(`فشل الرفع: ${result.message}`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function checkUpdateNow(): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy("update");
    try {
      const result = await checkForUpdate({
        supabaseUrl: SUPABASE_URL,
        bucket: SUPABASE_BUCKET,
      });
      if (result.status === "up-to-date") {
        setSuccessMsg("التطبيق محدّث بالفعل.");
      } else if (result.status === "updated") {
        setSuccessMsg(
          `تم تنزيل تحديث جديد (${result.version}). يمكنك تطبيقه من الإشعار أسفل الشاشة.`,
        );
      } else {
        setErrorMsg(`فشل التحقق: ${result.message}`);
      }
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <section
      dir="rtl"
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-6 md:p-8 flex flex-col gap-5 shadow-xl"
      aria-labelledby="cloud-backup-heading"
    >
      <header className="flex flex-col gap-2">
        <h2
          id="cloud-backup-heading"
          className="font-display text-xl md:text-2xl font-extrabold text-copper-400"
        >
          نسخة احتياطية سحابية (Supabase)
        </h2>
        <p className="text-sm text-espresso-300 leading-7">
          كل ساعة، يرفع التطبيق تلقائيًا نسخة مشفّرة من قاعدة البيانات إلى
          Supabase Storage — نسخة أحدث دائمًا في{" "}
          <span className="font-mono">backups/latest.enc</span> وسجل حتى 24
          نسخة سابقة.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={backupNow}
          disabled={disabled}
          className="min-h-[48px] px-5 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-espresso-50 font-bold border border-copper-700"
        >
          {busy === "backup" ? "جاري الرفع…" : "ارفع الآن"}
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

      <div className="border-t border-espresso-800 pt-4 flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-espresso-200">
          السجلّ الأخير
        </h3>
        {lastBackupAt && (
          <p className="text-xs text-espresso-400 font-mono" dir="ltr">
            آخر نسخة احتياطية: {new Date(lastBackupAt).toLocaleString("en-GB")}
          </p>
        )}
        {log.length === 0 ? (
          <p className="text-xs text-espresso-500">لا يوجد سجل بعد.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {log.map((entry, i) => (
              <li
                key={`${entry.at}-${i}`}
                className={`px-3 py-2 rounded-xl font-mono leading-5 ${
                  entry.kind === "success"
                    ? "bg-copper-950/30 text-copper-200"
                    : entry.kind === "skipped"
                      ? "bg-espresso-950/50 text-espresso-300"
                      : "bg-rust-950/30 text-rust-200"
                }`}
                dir="ltr"
              >
                <span className="opacity-60">
                  {new Date(entry.at).toLocaleString("en-GB")}
                </span>
                {" — "}
                {entry.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-espresso-800 pt-4 flex flex-col gap-3">
        <h3 className="text-sm font-extrabold text-espresso-200">
          تحديثات التطبيق
        </h3>
        {appVersion && (
          <p className="text-xs text-espresso-400 font-mono" dir="ltr">
            الإصدار الحالي: {appVersion}
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={checkUpdateNow}
            disabled={disabled}
            className="min-h-[44px] px-4 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700 text-sm"
          >
            {busy === "update" ? "جاري التحقق…" : "تحقق من التحديثات الآن"}
          </button>
        </div>
      </div>
    </section>
  );
}
