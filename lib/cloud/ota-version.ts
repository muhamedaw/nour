/**
 * Pure semver comparison — extracted from lib/cloud/ota.ts so tests can
 * import it without pulling in @capgo/capacitor-updater (a Capacitor
 * native plugin unavailable in Node).
 *
 * Compares two version strings segment-by-segment as numbers. Falls back
 * to a plain string inequality check if either side has a non-numeric
 * segment — either way, `candidate` only counts as newer than `current`
 * when it's unambiguously greater.
 */
export function isNewerVersion(current: string, candidate: string): boolean {
  const a = current.split(".");
  const b = candidate.split(".");
  const numericA = a.map(Number);
  const numericB = b.map(Number);
  if (numericA.every((n) => !Number.isNaN(n)) && numericB.every((n) => !Number.isNaN(n))) {
    const len = Math.max(numericA.length, numericB.length);
    for (let i = 0; i < len; i++) {
      const x = numericA[i] ?? 0;
      const y = numericB[i] ?? 0;
      if (y > x) return true;
      if (y < x) return false;
    }
    return false;
  }
  return candidate > current;
}
