/**
 * Pure formatter that turns a day's aggregated numbers into a plain-text
 * Arabic block, ready to paste into WhatsApp / SMS. Consumed by the
 * "Share as text" button in EndOfDayReport.
 *
 * Shape:
 *   تقرير {weekday} — {date}
 *   الإجمالي: 150.00 ₪
 *   سنوكر: 90.00 ₪ | Cards: 30.00 ₪ | بلايستيشن: 30.00 ₪
 *   عدد الجلسات: 12 (متوسط المدة: 45 د)
 *   الأكثر مبيعاً: قهوة (18)، شاي (12)، شيبس (9)
 */
import {
  AREA_AR,
  AREAS_ORDER,
  avgDurationMs,
  fmtDuration,
  fmtIntAr,
  fmtMoneyText,
  revenueByArea,
  sumRevenue,
  topProducts,
  type AreaBuckets,
  type ProductAgg,
} from "./report-aggregations";
import type { GroupSession } from "@/lib/types";

export interface BuildReportTextInput {
  /** Local calendar date for the report (midnight → end-of-day). */
  date: Date;
  /** Raw sessions for the day. Aggregated client-side. */
  sessions: GroupSession[];
}

export interface BuildReportTextOutput {
  text: string;
  /** Aggregations echoed back so the caller can render a preview. */
  totalRevenue: number;
  perArea: AreaBuckets;
  sessionCount: number;
  avgMs: number;
  top: ProductAgg[];
}

/** Date label in Arabic: e.g. "12 يوليو 2026" + weekday. */
function fmtDateAr(d: Date): { full: string; weekday: string } {
  const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const weekdayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { weekday: "long" });
  return { full: dateFmt.format(d), weekday: weekdayFmt.format(d) };
}

export function buildReportText({
  date,
  sessions,
}: BuildReportTextInput): BuildReportTextOutput {
  // Reuse the shared aggregations rather than re-implement the math here.
  // (Spec: "extract it into a shared function both the live dashboard
  // and this report call".)
  const totalRevenue = sumRevenue(sessions);
  const perArea = revenueByArea(sessions);
  const sessionCount = sessions.length;
  const avgMs = avgDurationMs(sessions);
  const top = topProducts(sessions, 5);

  const { full, weekday } = fmtDateAr(date);

  // Build the multi-line text block — one fact per line, no HTML.
  const lines: string[] = [];
  lines.push(`تقرير ${weekday} — ${full}`);
  lines.push(`الإجمالي: ${fmtMoneyText(totalRevenue)}`);
  const areaBits = AREAS_ORDER.map(
    (a) => `${AREA_AR[a]}: ${fmtMoneyText(perArea[a])}`,
  );
  lines.push(areaBits.join(" | "));
  lines.push(
    `عدد الجلسات: ${fmtIntAr(sessionCount)} (متوسط المدة: ${fmtDuration(avgMs)})`,
  );
  if (top.length > 0) {
    const topBits = top.map((it) => `${it.name} (${fmtIntAr(it.qty)})`);
    lines.push(`الأكثر مبيعاً: ${topBits.join("، ")}`);
  } else {
    lines.push("الأكثر مبيعاً: —");
  }

  return {
    text: lines.join("\n"),
    totalRevenue,
    perArea,
    sessionCount,
    avgMs,
    top,
  };
}
