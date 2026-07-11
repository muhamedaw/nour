import type { SessionItem } from "@/lib/types";

/** Area-agnostic bill breakdown shown at session close. */
export interface BillBreakdown {
  productsTotal: number;
  timeCost: number;
  elapsedMinutes: number;
  total: number;
}

/**
 * Compute the breakdown from the current line items, openedAt ISO, and
 * the area's hourly rate (`null` for product-only sessions).
 *
 * Defensive: items defensively read with `?? []` to survive the locked
 * `lib/store.ts` regression where the store pushes sessions without
 * seeding `items`. Once the locked team adds `items: []` to `openSession`
 * this still works.
 */
export function computeBill(
  items: SessionItem[] | undefined,
  openedAt: string,
  now: number | null,
  hourlyRate: number | null,
): BillBreakdown {
  const list = items ?? [];
  const productsTotal = list.reduce((sum, i) => sum + i.price * i.qty, 0);
  const elapsedMinutes = now === null ? 0 : Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 60000));
  const timeCost =
    hourlyRate === null
      ? 0
      : Math.round((elapsedMinutes / 60) * hourlyRate * 100) / 100;
  return {
    productsTotal,
    timeCost,
    elapsedMinutes,
    total: productsTotal + timeCost,
  };
}
