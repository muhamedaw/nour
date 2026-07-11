import type { AreaType, GroupSession } from "@/lib/types";
import { getAreaConfig } from "@/lib/config";

/* ---------- Helpers ---------- */

/** Format SAR with 2 decimals. */
export function fmtSAR(n: number): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Format elapsed millis as HH:MM:SS or MM:SS if under 1 hour. */
export function fmtElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/* ---------- Theme tokens ---------- */

/**
 * Tailwind class fragments per area — consistent across screens.
 *
 * NOTE: these mirror the `--area-snooker | --area-cards | --area-playstation`
 * CSS variables in `app/globals.css`. Tailwind utility classes are used
 * here (rather than `text-[var(--area-x)]`) because the palette needs
 * alpha channels (e.g. `emerald-600/40`) that the bare CSS vars can't.
 */
export const AREA_THEME: Record<
  AreaType,
  {
    accent: string; // ring class
    accentBg: string; // strong fill
    badge: string; // small pill
    focusRing: string; // focus-visible ring (per-area)
  }
> = {
  snooker: {
    accent: "ring-emerald-500/60",
    accentBg: "bg-emerald-600",
    badge: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
    focusRing: "focus-visible:ring-emerald-400",
  },
  cards: {
    accent: "ring-blue-500/60",
    accentBg: "bg-blue-600",
    badge: "bg-blue-600/20 text-blue-300 border-blue-600/40",
    focusRing: "focus-visible:ring-blue-400",
  },
  playstation: {
    accent: "ring-violet-500/60",
    accentBg: "bg-violet-600",
    badge: "bg-violet-600/20 text-violet-300 border-violet-600/40",
    focusRing: "focus-visible:ring-violet-400",
  },
};

/* ---------- View helpers over the locked config + store ---------- */

/**
 * Single source of truth for an area's UI properties:
 *   • Display label (from locked config)
 *   • Hourly rate (null = product-only)
 *
 * Falls back to the latin label name if `getAreaConfig` ever throws.
 */
export function getAreaView(
  area: AreaType,
): { label: string; hourlyRate: number | null; tableCount: number } {
  try {
    const c = getAreaConfig(area);
    return { label: c.label, hourlyRate: c.hourlyRate, tableCount: c.tableCount };
  } catch {
    return { label: area, hourlyRate: null, tableCount: 0 };
  }
}

/**
 * The locked store's `openSession` does NOT seed `items` (it pushes
 * `{id, area, tableNumber, openedAt, status}` and the new `GroupSession`
 * marks `items` as required). To consume store entries safely we read
 * `items` defensively.  This helper centralizes the fallback.
 */
export function viewItems(s: GroupSession): GroupSession["items"] {
  return s.items ?? [];
}

/** Cheap view of a session the floor / history views render.
 *  Inherits `label?` and `billedTotal?` from GroupSession. */
export type SessionView = GroupSession;
export function viewSession(s: GroupSession): SessionView {
  return { ...s, items: viewItems(s) };
}
