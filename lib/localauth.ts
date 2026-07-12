"use client";

/**
 * Session-scoped "unlocked" flag — separate from the persistent password
 * hash in lib/localdb (app_meta table). No cookies, no server round-trip:
 * this is a single device with no network exposure, so a localStorage flag
 * checked once per app load is enough. Clearing it (logout) just makes the
 * next load show the login form again.
 */
const UNLOCK_KEY = "staff_unlocked";

export function isUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(UNLOCK_KEY) === "1";
}

export function setUnlocked(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UNLOCK_KEY, "1");
}

export function clearUnlocked(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(UNLOCK_KEY);
}
