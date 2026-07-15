import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/auth/AuthGate";
import KeepScreenAwake from "@/components/KeepScreenAwake";
import DailyReporter from "@/components/telegram/DailyReporter";
import CloudBackupScheduler from "@/components/cloud/CloudBackupScheduler";
import OtaUpdater from "@/components/cloud/OtaUpdater";
import NavBar from "./NavBar";

/**
 * Type system:
 *  • Cairo (display) — headings, table numbers, the big total on the bill
 *    bar. Real Arabic character (not the generic system Arabic fallback),
 *    heavy weights available for the "confident, slightly bold" treatment
 *    the numbers/prices/timers deserve.
 *  • Tajawal (body) — labels, paragraphs, everything read at length. Calm
 *    and highly legible at arm's length.
 *  • JetBrains Mono (numeral) — every `font-mono` call site in the app is
 *    a price, a timer, or a table number. Swapping the mono stack here
 *    upgrades all of them at once without touching a single component.
 */
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-numeral",
  display: "swap",
});

export const metadata: Metadata = {
  title: "مقهى ترف — إدارة الطاولات",
  description: "إدارة طاولات السنوكر والكوتشينة والبلايستيشن",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom re-enabled — the phone-fit `--app-scale` shrink (see
  // SCALE_RUNTIME below) proportionally shrinks EVERYTHING on a real
  // phone, including text, since the whole 1024px tablet-first design
  // is uniformly scaled down to fit a ~375-412px real viewport (~0.35-
  // 0.40x). No font-size value can fix that on its own — it's always
  // multiplied by the same tiny factor. Locking users out of pinch-zoom
  // on top of that left them with no way to read small text at all.
  maximumScale: 5,
  userScalable: true,
};

/**
 * Inline pre-paint runtime that sets `--app-base-w` + `--app-scale` on
 * <html> so the `.app-shell` wrapper (app/globals.css) can scale the
 * whole UI uniformly to fit a phone viewport while preserving every
 * component's original pixel sizes. Runs before React hydrates so there
 * is no flash-of-unscaled-content on cold loads. See app/globals.css for
 * the rationale and the math.
 *
 * Note: ``dangerouslySetInnerHTML`` is safe here — the script is a
 * static, hand-written constant in this file; not user-derived.
 */
const SCALE_RUNTIME = `(function(){
  var BASE = 1024;
  // Floored at 0.65 (was unbounded down to ~0.35-0.40 on real phones) —
  // shrinking the whole 1024px tablet-first design down by the raw
  // width ratio made text/buttons too small to read on a real device,
  // and no font-size value can escape that multiplier since everything
  // is scaled uniformly. Floor traded per explicit user sign-off:
  // meaningfully bigger default text/buttons, in exchange for the
  // .app-shell canvas now genuinely overflowing viewport width on
  // narrow phones — body's overflow-x is auto (see globals.css) so the
  // overflow is reachable via horizontal scroll instead of clipped.
  // Tune this number based on further real-device feedback.
  var MIN_SCALE = 0.65;
  function apply(){
    var w = window.innerWidth || BASE;
    var s = Math.max(MIN_SCALE, Math.min(1, w / BASE));
    var root = document.documentElement;
    root.style.setProperty('--app-base-w', BASE + 'px');
    root.style.setProperty('--app-scale', s);
  }
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${tajawal.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCALE_RUNTIME }} />
      </head>
      {/*
        Body is a vertical flex column with `items-center` so the 1024px
        `.app-shell` stays horizontally centered on phones EVEN when it
        overflows the viewport. `margin-inline: auto` alone would resolve
        to 0 margins and anchor the UI to the left edge; flex centering
        handles symmetric overflow correctly.

        `overflow-x-auto` (was `-hidden`) — the MIN_SCALE floor in
        SCALE_RUNTIME now deliberately lets `.app-shell` overflow
        viewport width on narrow phones in exchange for bigger default
        text; this makes that overflow reachable via horizontal scroll
        instead of silently clipping content off-screen.

        `items-[safe_center]` (not plain `items-center`) — plain
        centering positions an overflowing child at a NEGATIVE offset on
        its start side (roughly half the overflow left, half right), and
        browsers only expose the positive-offset side to scrolling —
        the negative side is permanently unreachable no matter what
        overflow-x is set to. `safe center` falls back to start-alignment
        once the child doesn't fit, keeping scrollLeft at 0 with the
        full overflow reachable in one scroll direction instead of half
        of it stuck off-screen.
      */}
      <body className="bg-espresso-950 text-espresso-100 min-h-screen antialiased font-sans overflow-x-auto flex flex-col items-[safe_center]">
        <div className="app-shell">
          {/* Mounted OUTSIDE <AuthGate> so the wake lock is held even
              while the auth check is running — staff shouldn't have to
              re-enter the password because the screen dimmed. */}
          <KeepScreenAwake />
          <DailyReporter />
          <CloudBackupScheduler />
          <OtaUpdater />
          <AuthGate>
            <NavBar />
            {children}
          </AuthGate>
        </div>
      </body>
    </html>
  );
}
