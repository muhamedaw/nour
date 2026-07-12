import type { AreaType, GroupSession } from "@/lib/types";
import { getAreaConfig } from "@/lib/config";

/* ---------- Helpers ---------- */

/** Format ILS (shekel) with 2 decimals. Name kept as `fmtSAR` to avoid churning ~15 call sites. */
export function fmtSAR(n: number): string {
  return new Intl.NumberFormat("ar-SA-u-nu-latn", {
    style: "currency",
    currency: "ILS",
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
 * One accent (copper) for every area — the old build gave each area its
 * own hero hue (emerald/blue/violet), which reads as three competing
 * "primary" colors fighting for attention. Areas are told apart by icon +
 * Arabic label instead (see AREA_ICON below); color is reserved for
 * meaning that matters everywhere (interactive, busy, accent), not for
 * area bookkeeping.
 */
export const AREA_THEME: Record<
  AreaType,
  {
    accent: string; // ring class
    accentBg: string; // strong fill
    badge: string; // small pill
    focusRing: string; // focus-visible ring
  }
> = {
  snooker: {
    accent: "ring-copper-500/60",
    accentBg: "bg-copper-600",
    badge: "bg-copper-600/20 text-copper-300 border-copper-600/40",
    focusRing: "focus-visible:ring-copper-400",
  },
  cards: {
    accent: "ring-copper-500/60",
    accentBg: "bg-copper-600",
    badge: "bg-copper-600/20 text-copper-300 border-copper-600/40",
    focusRing: "focus-visible:ring-copper-400",
  },
  playstation: {
    accent: "ring-copper-500/60",
    accentBg: "bg-copper-600",
    badge: "bg-copper-600/20 text-copper-300 border-copper-600/40",
    focusRing: "focus-visible:ring-copper-400",
  },
};

/** Instantly-recognizable glyph per area — reads from arm's length faster than a color chip. */
export const AREA_ICON: Record<AreaType, string> = {
  snooker: "🎱",
  cards: "🃏",
  playstation: "🎮",
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
