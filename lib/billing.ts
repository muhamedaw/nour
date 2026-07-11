import { AreaConfig, GroupSession } from "./types";

export interface BillBreakdown {
  productsTotal: number;
  timeCost: number;
  elapsedMinutes: number;
  total: number;
}

export function computeBill(
  session: GroupSession,
  area: AreaConfig,
  closedAt: Date = new Date()
): BillBreakdown {
  const productsTotal = session.items.reduce((sum, i) => sum + i.qty * i.price, 0);
  const elapsedMs = closedAt.getTime() - new Date(session.openedAt).getTime();
  const elapsedMinutes = Math.max(0, Math.round(elapsedMs / 60000));
  const timeCost = area.hourlyRate ? (elapsedMinutes / 60) * area.hourlyRate : 0;
  return { productsTotal, timeCost, elapsedMinutes, total: productsTotal + timeCost };
}
