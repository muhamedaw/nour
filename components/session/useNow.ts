"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current timestamp (`Date.now()`) and ticks every `intervalMs`.
 *
 * Hydration-safe: starts as `null` so the server-rendered and first-paint
 * outputs match. The timer engages on mount.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Set initial value, then tick.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
