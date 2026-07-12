/**
 * Shared aggregation helpers — consumed by BOTH the live dashboard
 * (`components/dashboard/DashboardView.tsx`) and the printable End-of-Day
 * Report (`components/dashboard/EndOfDayReport.tsx`).
 *
 * Every function is pure and total: never throws on empty input,
 * never produces NaN. Defensive against missing fields (`billedTotal`,
 * `closedAt`, `items`) so partial / in-flight data doesn't break the math.
 */
import type { AreaType, GroupSession, SessionItem } from "@/lib/types";

/* ----------------------------- Types ----------------------------- */

export type AreaBuckets = Record<AreaType, number>;
export type ProductAgg = {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
};

/* ----------------------------- Constants ----------------------------- */

export const ZERO_AREA: AreaBuckets = {
  snooker: 0,
  cards: 0,
  playstation: 0,
};
export const AREAS_ORDER: AreaType[] = ["snooker", "cards", "playstation"];

/** Localized area names — reused by both the dashboard and the report. */
export const AREA_AR: Record<AreaType, string> = {
  snooker: "سنوكر",
  cards: "Cards",
  playstation: "بلايستيشن",
};

/* ----------------------------- Money helpers ----------------------------- */

/**
 * Money formatter for clipboard text. Mirrors domain.fmtSAR but emits
 * the SAR suffix as " ريال" so pasted output reads naturally (vs the
 * `Intl` "SAR" / "ر.س.‏" pinned form that crumples in WhatsApp).
 */
const TEXT_NUM = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
export function fmtMoneyText(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return `${TEXT_NUM.format(safe)} ريال`;
}

/* ----------------------------- Aggregations ----------------------------- */

export function sumRevenue(arr: GroupSession[]): number {
  let s = 0;
  for (const x of arr) s += x.billedTotal ?? 0;
  return s;
}

export function revenueByArea(arr: GroupSession[]): AreaBuckets {
  const out: AreaBuckets = { ...ZERO_AREA };
  for (const x of arr) out[x.area] += x.billedTotal ?? 0;
  return out;
}

export function avgDurationMs(arr: GroupSession[]): number {
  let sum = 0;
  let n = 0;
  for (const x of arr) {
    if (!x.closedAt) continue;
    const a = new Date(x.openedAt).getTime();
    const b = new Date(x.closedAt).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      sum += b - a;
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

export function topProducts(arr: GroupSession[], limit = 5): ProductAgg[] {
  const map = new Map<string, ProductAgg>();
  for (const s of arr) {
    const items: SessionItem[] = s.items ?? [];
    for (const it of items) {
      const safeName = it.name && it.name.length > 0 ? it.name : "—";
      const prev = map.get(it.productId) ?? {
        productId: it.productId,
        name: safeName,
        qty: 0,
        revenue: 0,
      };
      // Name is the FIRST snapshot we see — once pinned we don't let later
      // snapshots overwrite it. `SessionItem.name` is captured at add-time
      // so the first observation is the canonical display name.
      prev.qty += it.qty;
      prev.revenue += it.qty * it.price;
      map.set(it.productId, prev);
    }
  }
  return Array.from(map.values())
    .sort(
      (a, b) =>
        b.qty - a.qty || b.revenue - a.revenue || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

export function hourlyRevenue(arr: GroupSession[]): number[] {
  const out = new Array<number>(24).fill(0);
  for (const s of arr) {
    if (!s.closedAt) continue;
    const h = new Date(s.closedAt).getHours();
    if (h >= 0 && h < 24) out[h] += s.billedTotal ?? 0;
  }
  return out;
}

/** Human-friendly duration formatter for the report card + share text. */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return "أقل من دقيقة";
  if (totalMin < 60) return `${totalMin} د`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} س` : `${h} س ${m} د`;
}

/* ----------------------------- Locale helpers ----------------------------- */

/** Arabic-Indic numerals for any integer. Used in clipboard text. */
const AR_INT = new Intl.NumberFormat("ar-SA-u-nu-latn", { useGrouping: false });
export function fmtIntAr(n: number): string {
  return AR_INT.format(Math.trunc(n));
}
