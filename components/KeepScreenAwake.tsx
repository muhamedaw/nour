"use client";

import { useEffect } from "react";

/**
 * KeepScreenAwake — request a screen Wake Lock for the lifetime of
 * the POS app, so the tablet's display never sleeps while staff is
 * using the app. Without this, the WebView dims and locks after the
 * OS's default screen timeout (typically 30s-2min), interrupting
 * active sessions on the floor.
 *
 * Uses the standard W3C Screen Wake Lock API
 * (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
 * Supported in all modern Android WebViews (Chrome 84+), which is
 * what Capacitor 6 ships on Android. On older WebViews the component
 * silently no-ops; the OS screen timeout still applies, but the app
 * itself is unaffected.
 *
 * Lifecycle:
 *  • On mount, request a wake lock.
 *  • When the page becomes hidden (Home, app switcher, screen off),
 *    the browser automatically releases the lock — we listen for the
 *    `visibilitychange` event and re-acquire as soon as the page is
 *    visible again, so the lock is always held while the app is in
 *    the foreground.
 *  • On unmount (shouldn't happen in the root layout, but just in
 *    case), release the lock explicitly.
 *
 * Render: returns `null`. This is a side-effect-only component —
 * mount it once anywhere in the React tree and forget about it.
 */
export default function KeepScreenAwake() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      // API not supported by this WebView. Fail silently — the rest
      // of the app keeps working, the screen just might dim.
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    // Tracks an in-flight acquire() so back-to-back triggers
    // (visibilitychange + release event firing in quick
    // succession when the system releases the lock as the page
    // comes back to the foreground) collapse into a single
    // request instead of two racing ones.
    let inFlight: Promise<void> | null = null;

    const acquire = async () => {
      if (sentinel || inFlight) return;
      inFlight = (async () => {
        try {
          const s = await navigator.wakeLock.request("screen");
          sentinel = s;
          // The system can release the lock for power-management
          // reasons (battery saver kicks in, low battery alert,
          // notification shade pulled down, etc.) without firing
          // visibilitychange. Listen for the explicit `release`
          // event so we can re-acquire immediately if the page is
          // still in the foreground — otherwise the screen would
          // stay dark until the user switched apps and back.
          s.addEventListener("release", () => {
            sentinel = null;
            if (document.visibilityState === "visible") acquire();
          });
        } catch (err) {
          // Most common causes: page not visible at request time,
          // permission denied, or the WebView's permissions policy
          // blocking the API. Log and move on — the staff can
          // still use the app, the screen just might dim after
          // the OS timeout.
          console.warn("[KeepScreenAwake] wakeLock.request failed:", err);
          sentinel = null;
        } finally {
          inFlight = null;
        }
      })();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && sentinel === null) {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sentinel) {
        sentinel.release().catch(() => undefined);
        sentinel = null;
      }
    };
  }, []);

  return null;
}
