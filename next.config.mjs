/**
 * مقهى ترف POS — Next.js config.
 *
 * Fully offline now: no server, no API routes, no network calls. The app
 * runs entirely inside the WebView on the device, with lib/localdb/ (sql.js
 * + IndexedDB) as the only data layer. `output: "export"` produces a plain
 * static ./out folder — no server-mode Next.js build target exists anymore
 * to keep separate (there is no API left to break, so nothing depends on
 * server mode). `npx cap sync android` copies ./out into the Android
 * project; Gradle packages it into the APK (see scripts/build-apk.ps1).
 *
 * `trailingSlash` + `images.unoptimized` are both required for static
 * export — Next's image optimizer needs a running server, which a fully
 * static site doesn't have.
 *
 * Dynamic route segments (e.g. `app/table/[id]/`) are pre-rendered via
 * `generateStaticParams` in each page.tsx (see app/table/[id]/page.tsx).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
