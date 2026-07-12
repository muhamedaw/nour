"use client";

/**
 * Backup / Restore — export the live database snapshot as a single .db
 * file and hand it to the OS share sheet, or accept a previously-exported
 * file and ask the user to confirm before overwriting current data.
 *
 * Design (locked):
 *   • Talks to `lib/localdb` exclusively — never touches the file path
 *     directly. The DB layer owns where the SQLite file lives; we just
 *     request a Blob snapshot for export and pass a Blob for import.
 *   • `exportDatabaseSnapshot(): Promise<Blob>` returns a binary
 *     snapshot of the entire live DB. We convert it to a base64 string
 *     for portable native `Filesystem.writeFile` calls, then immediately
 *     hand the resulting file:// URI to the OS share sheet.
 *   • `importDatabaseSnapshot(file: Blob): Promise<void>` is destructive.
 *     The confirm step names the file and shows a clear Arabic warning
 *     before any write.
 *   • After import, `window.location.reload()` forces a fresh DB
 *     connection on the next page mount. Any unsaved in-progress edits
 *     are lost (already called out in the confirm modal).
 *   • Cheap pre-flight check on import: every SQLite file begins with
 *     the 16-byte header `SQLite format 3\0`. We reject obviously-wrong
 *     files before calling into `lib/localdb`.
 *
 * File picker strategy: a plain HTML `<input type="file">` inside the
 * WebView. Capacitor 6 forwards this to the system picker, no extra
 * plugin required. The chosen `File` is a Blob subtype, so it flows
 * straight into `importDatabaseSnapshot`.
 */

import { useEffect, useRef, useState } from "react";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { exportDatabaseSnapshot, importDatabaseSnapshot } from "@/lib/localdb";

type Phase = "idle" | "exporting" | "importing" | "done" | "error";

export default function BackupRestore(): JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset the file input's value after each pick so picking the same
  // file twice in a row still triggers onChange.
  useEffect(() => {
    if (pendingFile && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [pendingFile]);

  async function handleExport(): Promise<void> {
    setPhase("exporting");
    setErrorMsg(null);
    try {
      const blob = await exportDatabaseSnapshot();
      if (!blob || blob.size === 0) {
        throw new Error("قاعدة البيانات فارغة.");
      }

      // Note: @capacitor/filesystem v6 defaults the write encoding to base64
      // when no `encoding` field is supplied and `data` is a string (see
      // WriteFileOptions.encoding in node_modules/@capacitor/filesystem/
      // dist/esm/definitions.d.ts). Converting the Blob to a base64 string
      // here is the most portable path across web + native Android.
      const base64 = await blobToBase64(blob);

      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const exportName = `floor-backup-${ts}.db`;
      const written = await Filesystem.writeFile({
        path: exportName,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: "Floor DB Backup",
        text: "نسخة احتياطية من قاعدة بيانات مقهى ترف",
        url: written.uri,
        dialogTitle: "حفظ النسخة الاحتياطية",
      });
      setPhase("done");
    } catch (e) {
      // User cancelling the OS share sheet surfaces as a throw on some
      // Android OEM share targets; treat it as a benign no-op, not a
      // real error, so the user doesn't see a scary red banner after
      // a perfectly normal interaction.
      const msg = (e as Error)?.message ?? "";
      if (/cancel/i.test(msg)) {
        setPhase("idle");
        return;
      }
      setErrorMsg(msg || "تعذّر التصدير.");
      setPhase("error");
    }
  }

  function openFilePicker(): void {
    setErrorMsg(null);
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
  }

  function cancelImport(): void {
    setPendingFile(null);
  }

  async function confirmImport(): Promise<void> {
    if (!pendingFile) return;
    setPhase("importing");
    setErrorMsg(null);
    try {
      // Cheap pre-flight: SQLite files always start with "SQLite format 3\0"
      // in their first 16 bytes. Reject obviously-wrong files before
      // handing them to lib/localdb so the user gets a friendly error.
      if (pendingFile.size < 16) {
        throw new Error("الملف صغير جدًا ليكون قاعدة بيانات SQLite.");
      }
      const headerBytes = new Uint8Array(
        await pendingFile.slice(0, 16).arrayBuffer(),
      );
      const header = new TextDecoder().decode(headerBytes);
      if (!header.startsWith("SQLite format 3")) {
        throw new Error("الملف ليس قاعدة بيانات SQLite صالحة.");
      }
      // File extends Blob, so the picked file flows straight into
      // importDatabaseSnapshot without an extra conversion.
      await importDatabaseSnapshot(pendingFile);
      setPhase("done");
      // Tiny delay so the success message paints before reload tears it down.
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 600);
    } catch (e) {
      setErrorMsg((e as Error)?.message ?? "تعذّر الاستيراد.");
      setPhase("error");
    }
  }

  const busy = phase === "exporting" || phase === "importing";

  return (
    <section
      dir="rtl"
      className="bg-espresso-900 border border-espresso-800 rounded-3xl p-6 md:p-8 flex flex-col gap-5 shadow-xl"
      aria-labelledby="backup-heading"
    >
      <header className="flex flex-col gap-2">
        <h2
          id="backup-heading"
          className="font-display text-xl md:text-2xl font-extrabold text-copper-400"
        >
          النسخ الاحتياطي والاستيراد
        </h2>
        <p className="text-sm text-espresso-300 leading-7">
          صدّر قاعدة البيانات كملف واحد وشاركه عبر البريد أو Drive، أو
          استورد ملف نسخة احتياطية سبق تصديره ليتم استبدال البيانات الحالية
          به. ينطبق هذا الإجراء على الجهاز بالكامل — كل الجلسات
          والمنتجات وسجل الفواتير.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className="min-h-[48px] px-5 rounded-2xl bg-copper-600 hover:bg-copper-500 disabled:opacity-50 text-espresso-50 font-bold border border-copper-700 transition-colors duration-200"
        >
          {phase === "exporting" ? "جاري التصدير…" : "تصدير نسخة احتياطية"}
        </button>
        <button
          type="button"
          onClick={openFilePicker}
          disabled={busy}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700 transition-colors duration-200"
        >
          {phase === "importing" ? "جاري الاستيراد…" : "استيراد نسخة احتياطية"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".db,.sqlite,.sqlite3,application/octet-stream"
          onChange={onFileChange}
          className="hidden"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      {phase === "done" && !pendingFile && (
        <p
          role="status"
          className="text-sm text-copper-300 bg-copper-950/40 border border-copper-800 rounded-2xl px-4 py-3"
        >
          تمت العملية بنجاح.
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

      {pendingFile && (
        <ConfirmImportPanel
          filename={pendingFile.name}
          size={pendingFile.size}
          busy={busy}
          onCancel={cancelImport}
          onConfirm={confirmImport}
        />
      )}
    </section>
  );
}

function ConfirmImportPanel({
  filename,
  size,
  busy,
  onCancel,
  onConfirm,
}: {
  filename: string;
  size: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="backup-import-confirm"
      dir="rtl"
      className="bg-copper-950/40 border-2 border-copper-700 rounded-2xl p-5 flex flex-col gap-4"
    >
      <h3
        id="backup-import-confirm"
        className="font-display text-lg font-extrabold text-copper-300"
      >
        تأكيد استبدال قاعدة البيانات
      </h3>
      <p className="text-sm text-copper-100 leading-7">
        سيتم استبدال كل البيانات الحالية في هذا الجهاز ببيانات الملف:{" "}
        <span className="font-mono font-bold text-copper-200 break-all">
          {filename}
        </span>{" "}
        ({formatBytes(size)}). أي جلسات مفتوحة أو تعديلات لم يتم حفظها
        ستفقد. لا يمكن التراجع.
      </p>
      <div className="flex flex-wrap items-center gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-[48px] px-5 rounded-2xl bg-espresso-800 hover:bg-espresso-700 disabled:opacity-50 text-espresso-50 font-bold border border-espresso-700 transition-colors duration-200"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-[56px] px-7 rounded-2xl bg-copper-500 hover:bg-copper-400 disabled:opacity-50 text-espresso-50 text-lg font-extrabold border border-copper-700 shadow-lg shadow-copper-950/40 transition-colors duration-200"
        >
          {busy ? "جاري الاستبدال…" : "تأكيد الاستبدال"}
        </button>
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        // result is a data: URL like "data:application/octet-stream;base64,XXXX".
        // Strip the prefix so Capacitor's writeFile gets pure base64.
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
        return;
      }
      reject(new Error("تعذّر قراءة البيانات."));
    };
    reader.onerror = () => reject(new Error("تعذّر قراءة البيانات."));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}
