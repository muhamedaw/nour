import type { SessionItem } from "@/lib/types";

/** Area-agnostic bill breakdown shown at session close. */
export interface BillBreakdown {
  productsTotal: number;
  timeCost: number;
  elapsedMinutes: number;
  timeAdjustmentSeconds: number;
  total: number;
}

/**
 * Compute the breakdown from the current line items, openedAt ISO, and
 * the area's hourly rate (`null` for product-only sessions).
 *
 * `timeAdjustmentSeconds` is the cumulative manual correction from
 * `GroupSession.timeAdjustmentSeconds` (added via the tap-to-adjust clock UI)
 * — folded into elapsed time as
 * `max(0, (now - openedAt) + timeAdjustmentSeconds*1000)`. This exact
 * formula is also what SessionHeader's live clock must use, so the number
 * on screen and the number billed never drift apart.
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
  timeAdjustmentSeconds = 0,
): BillBreakdown {
  const list = items ?? [];
  const productsTotal = list.reduce((sum, i) => sum + i.price * i.qty, 0);
  const elapsedMs =
    now === null ? null : Math.max(0, now - new Date(openedAt).getTime() + timeAdjustmentSeconds * 1000);
  const elapsedMinutes = elapsedMs === null ? 0 : Math.floor(elapsedMs / 60000);
  const timeCost =
    hourlyRate === null
      ? 0
      : Math.round((elapsedMinutes / 60) * hourlyRate * 100) / 100;
  return {
    productsTotal,
    timeCost,
    elapsedMinutes,
    timeAdjustmentSeconds,
    total: productsTotal + timeCost,
  };
}

/** One player's cut of the bill at close time. */
export interface SplitShare {
  index: number;
  label: string;
  individualTotal: number;
  evenShare: number;
  total: number;
}

export interface SplitResult {
  playerCount: number;
  individualItemsTotal: number;
  evenPoolTotal: number;
  perPlayerBase: number;
  remainder: number;
  shares: SplitShare[];
}

/**
 * Splits `breakdown.total` across `playerCount` people. Items with a
 * non-empty `assignedPlayer` are billed wholly to that person and excluded
 * from the even pool entirely — including when their `assignedPlayer` value
 * doesn't match any of the current `playerCount` slots' labels (that item
 * still reduces `evenPoolTotal` correctly, but won't show up under any
 * `share.individualTotal`; the UI is responsible for detecting and blocking
 * that mismatch before allowing the table to close, not this function).
 *
 * The even pool's leftover cents after flooring go entirely to shares[0] so
 * `sum(shares[].total) === breakdown.total` exactly — nobody's bill ever
 * silently loses or gains a fraction of a currency unit.
 */
export function computeSplit(
  breakdown: BillBreakdown,
  items: SessionItem[],
  playerCount: number,
  playerNames: string[] = [],
): SplitResult {
  const clampedCount = Math.max(1, Math.floor(playerCount) || 1);

  const individualItemsTotal = items.reduce(
    (sum, i) => (i.assignedPlayer ? sum + i.price * i.qty : sum),
    0,
  );
  const evenPoolTotal = Math.round((breakdown.total - individualItemsTotal) * 100) / 100;
  const perPlayerBase = Math.floor((evenPoolTotal / clampedCount) * 100) / 100;
  const remainder = Math.round((evenPoolTotal - perPlayerBase * clampedCount) * 100) / 100;

  const shares: SplitShare[] = Array.from({ length: clampedCount }, (_, index) => {
    const label = playerNames[index]?.trim() || `لاعب ${index + 1}`;
    const individualTotal = items.reduce(
      (sum, i) => (i.assignedPlayer === label ? sum + i.price * i.qty : sum),
      0,
    );
    const evenShare = perPlayerBase + (index === 0 ? remainder : 0);
    return { index, label, individualTotal, evenShare, total: individualTotal + evenShare };
  });

  return {
    playerCount: clampedCount,
    individualItemsTotal,
    evenPoolTotal,
    perPlayerBase,
    remainder,
    shares,
  };
}
