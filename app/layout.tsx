import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/auth/AuthGate";
import KeepScreenAwake from "@/components/KeepScreenAwake";
import DailyReporter from "@/components/telegram/DailyReporter";
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
  maximumScale: 1,
  userScalable: false,
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
  function apply(){
    var w = window.innerWidth || BASE;
    var s = Math.min(1, w / BASE);
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
      */}
      <body className="bg-espresso-950 text-espresso-100 min-h-screen antialiased font-sans overflow-x-hidden flex flex-col items-center">
        <div className="app-shell">
          {/* Mounted OUTSIDE <AuthGate> so the wake lock is held even
              while the auth check is running — staff shouldn't have to
              re-enter the password because the screen dimmed. */}
          <KeepScreenAwake />
          <DailyReporter />
          <AuthGate>
            <NavBar />
            {children}
          </AuthGate>
        </div>
      </body>
    </html>
  );
}
