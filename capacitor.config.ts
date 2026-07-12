import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 6 (Android target) config for the offline مقهى ترف POS.
 *
 * Architecture (locked — do not "improve"):
 *   • The Next.js app is fully self-contained inside the APK. There is
 *     no LAN server, no launcher, no connection-state to lose — the
 *     `npx cap sync android` step copies the static-exported
 *     `./out/` directory into `android/app/src/main/assets/public/`
 *     and the WebView loads it directly via the bundled
 *     `https://localhost/` origin (Capacitor 6's default scheme).
 *   • Build pipeline: `APK_BUILD=1 npm run build` → `npx cap sync android`
 *     → `cd android && ./gradlew assembleDebug`. See `scripts/build-apk.sh`.
 *   • Data layer: a WebView-local SQLite (lib/localdb/ — refactored
 *     by the other team). All api-client.ts functions resolve locally
 *     and synchronously-ish; no CORS, no cross-origin, no retries.
 *
 * Important config choices:
 *   • `webDir`         — `"./out"` — produced by `next build` with
 *                        `APK_BUILD=1` (next.config.mjs gates
 *                        `output: "export"` on that env var). The
 *                        launcher/ and connection/ directories that
 *                        the LAN architecture used to ship are gone.
 *   • `server.androidScheme` — `"https"` matches Capacitor 6's default.
 *                        Do not use `"http"` or cookies / ServiceWorkers
 *                        will silently break.
 *   • `server.allowNavigation` — `[]` (empty). The app is fully local;
 *                        no cross-origin navigation. The previous
 *                        `["*"]` wildcard is no longer needed and would
 *                        be a footgun if a future page accidentally
 *                        tried to navigate off-bundle.
 *   • No `server.cleartext` / no `server.errorPath` / no
 *     `server.url` — the WebView never talks to a remote server and
 *     never needs cleartext or a fallback path.
 *   • `android.allowMixedContent` — `false` (default). There's no
 *     mixed content to allow; the bundle is all same-origin.
 *   • Deep-link schemes — none registered at the Capacitor layer.
 *     If the user wants to reconfigure the LAN/standalone mode in a
 *     future iteration, do it here, NOT in AndroidManifest.xml.
 *   • Splash + status bar — dark slate surface, no spinner, "Dark"
 *     status-bar style so text + symbols stay readable on a landscape
 *     tablet.
 */
const config: CapacitorConfig = {
  appId: "com.taraf.coffeeshop",
  appName: "مقهى ترف",
  webDir: "out",
  android: {
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: "https",
    allowNavigation: [],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0a0a0a",
      overlaysWebView: false,
    },
  },
};

export default config;
