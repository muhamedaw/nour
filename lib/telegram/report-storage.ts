/**
 * Local persistence of every daily report — so the shop has a
 * permanent on-device log of every closed-day sales record,
 * independent of whether the Telegram send succeeded. The CSV is
 * written to Documents/reports/nour-sales-YYYY-MM-DD.csv, and a
 * matching JSON sidecar holds the metadata (saved-at, session
 * count, total revenue, Telegram send status + message id).
 *
 * The data lives in Capacitor's `Directory.Documents` (Android
 * scoped storage) so the user can:
 *   • Browse the files in any Android file manager
 *   • Pull them via USB / MTP to a PC and open in Excel
 *   • Re-share a past report from the in-app "Saved Reports" section
 *
 * Filename convention is the index: the date is encoded in the
 * filename so listSavedReports() doesn't need a separate index file.
 * The sidecar JSON is best-effort — if it goes missing (manual file
 * delete, etc.) the list view still shows the CSV, just without
 * the rich metadata.
 *
 * Failure modes are non-fatal: save failures are returned to the
 * caller (so runDailyReport can decide whether to abort the Telegram
 * send or proceed), but every other helper (`listSavedReports`,
 * `deleteSavedReport`, `shareSavedReport`) returns a benign default
 * on error rather than throwing — the saved-reports UI is
 * best-effort, not load-bearing.
 */

import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const REPORTS_DIR = "reports";
const CSV_PREFIX = "nour-sales-";
const CSV_SUFFIX = ".csv";
const META_SUFFIX = ".json";

export interface ReportMetadata {
  date: string;
  savedAt: string;
  /** Number of distinct sessions in the report (sum of billedTotal ≈ Σ). */
  sessionCount: number;
  /** Sum of session.billedTotal across all closed sessions that day. */
  totalRevenue: number;
  /** CSV body lines (excluding the header row). */
  csvRowCount: number;
  telegramSent: boolean;
  /** Only present when telegramSent === true. */
  telegramMessageId?: number;
}

export interface SavedReport {
  date: string;
  size: number;
  metadata: ReportMetadata | null;
}

export type SaveResult =
  | { ok: true; uri: string }
  | { ok: false; error: string };

function csvPath(date: string): string {
  return `${REPORTS_DIR}/${CSV_PREFIX}${date}${CSV_SUFFIX}`;
}

function metaPath(date: string): string {
  return `${REPORTS_DIR}/${CSV_PREFIX}${date}${META_SUFFIX}`;
}

function dateFromFilename(name: string): string | null {
  if (!name.startsWith(CSV_PREFIX) || !name.endsWith(CSV_SUFFIX)) return null;
  return name.slice(CSV_PREFIX.length, name.length - CSV_SUFFIX.length);
}

/**
 * Writes the CSV + matching JSON sidecar. Overwrites if a report
 * for `date` already exists (idempotent — same date = same report).
 * `recursive: true` creates the `reports/` subdirectory on first save.
 *
 * Encoding is explicitly `utf8` so the on-disk file is the raw CSV
 * (not a base64-of-the-CSV) — a user who pulls the file via USB can
 * open it in Excel / Google Sheets without an extra decode step.
 */
export async function saveReportLocally(
  date: string,
  csvText: string,
  metadata: Omit<ReportMetadata, "date" | "savedAt">,
): Promise<SaveResult> {
  try {
    const written = await Filesystem.writeFile({
      path: csvPath(date),
      data: csvText,
      encoding: Encoding.UTF8,
      directory: Directory.Documents,
      recursive: true,
    });
    const fullMetadata: ReportMetadata = {
      date,
      savedAt: new Date().toISOString(),
      ...metadata,
    };
    await Filesystem.writeFile({
      path: metaPath(date),
      data: JSON.stringify(fullMetadata, null, 2),
      encoding: Encoding.UTF8,
      directory: Directory.Documents,
      recursive: true,
    });
    return { ok: true, uri: written.uri };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "Unknown error" };
  }
}

/** Patch the sidecar JSON without rewriting the CSV. */
async function updateMetadata(
  date: string,
  patch: Partial<Omit<ReportMetadata, "date">>,
): Promise<void> {
  try {
    const result = await Filesystem.readFile({
      path: metaPath(date),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    const existing = JSON.parse(result.data as string) as ReportMetadata;
    const merged: ReportMetadata = { ...existing, ...patch };
    await Filesystem.writeFile({
      path: metaPath(date),
      data: JSON.stringify(merged, null, 2),
      encoding: Encoding.UTF8,
      directory: Directory.Documents,
    });
  } catch (e) {
    // Sidecar missing or unparseable — silently skip. The CSV is
    // still on disk and the report is still useful without metadata.
    console.warn("[report-storage] updateMetadata failed:", e);
  }
}

/**
 * Lists every saved report, newest first. Walks the `reports/`
 * directory, derives the date from each CSV filename, and reads the
 * sidecar JSON (if present) for rich metadata. Files without a
 * sidecar still appear — with `metadata: null` — so a manual
 * file-manager copy into the directory still shows up.
 */
export async function listSavedReports(): Promise<SavedReport[]> {
  try {
    const result = await Filesystem.readdir({
      path: REPORTS_DIR,
      directory: Directory.Documents,
    });
    const reports: SavedReport[] = [];
    for (const entry of result.files) {
      if (entry.type !== "file") continue;
      const date = dateFromFilename(entry.name);
      if (!date) continue;
      const meta = await readMetadata(date);
      reports.push({
        date,
        size: entry.size,
        metadata: meta,
      });
    }
    // Newest first.
    reports.sort((a, b) => b.date.localeCompare(a.date));
    return reports;
  } catch {
    // Directory doesn't exist yet (no reports saved) — empty list.
    return [];
  }
}

async function readMetadata(date: string): Promise<ReportMetadata | null> {
  try {
    const result = await Filesystem.readFile({
      path: metaPath(date),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(result.data as string) as ReportMetadata;
  } catch {
    return null;
  }
}

export async function readSavedReportCsv(date: string): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({
      path: csvPath(date),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return result.data as string;
  } catch {
    return null;
  }
}

export async function deleteSavedReport(date: string): Promise<boolean> {
  try {
    await Filesystem.deleteFile({
      path: csvPath(date),
      directory: Directory.Documents,
    }).catch(() => undefined);
    await Filesystem.deleteFile({
      path: metaPath(date),
      directory: Directory.Documents,
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/**
 * Hand a saved report to the OS share sheet. Writes a copy of the
 * CSV into the Cache directory first (Share needs a file:// URI
 * on Android — the Documents URI alone is not always shareable).
 *
 * The user-cancelled-share case is treated as a no-op, not an error.
 */
export async function shareSavedReport(
  date: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const csv = await readSavedReportCsv(date);
    if (!csv) return { ok: false, error: "الملف غير موجود." };
    const cachePath = `${CSV_PREFIX}${date}${CSV_SUFFIX}`;
    const written = await Filesystem.writeFile({
      path: cachePath,
      data: csv,
      encoding: Encoding.UTF8,
      directory: Directory.Cache,
    });
    const meta = await readMetadata(date);
    const caption = meta
      ? `📊 تقرير مبيعات ${meta.date} — ${meta.sessionCount} جلسة — ₪${meta.totalRevenue.toFixed(2)}`
      : `📊 تقرير مبيعات ${date}`;
    await Share.share({
      title: `تقرير مبيعات ${date}`,
      text: caption,
      url: written.uri,
      dialogTitle: "مشاركة التقرير",
    });
    return { ok: true };
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    // User cancelling the OS share sheet surfaces as a throw on some
    // Android OEM share targets; treat as a benign no-op.
    if (/cancel/i.test(msg)) return { ok: true };
    return { ok: false, error: msg || "تعذّرت المشاركة." };
  }
}

/**
 * Re-exported so runDailyReport can call updateMetadata() to record
 * the Telegram send result on the sidecar without re-writing the CSV.
 */
export { updateMetadata };
