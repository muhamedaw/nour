# APK Deployment Guide

The مقهى ترف app is a fully offline standalone Android app — no server,
no LAN setup needed.  Everything runs inside the APK.

---

## Architecture

- **Next.js static export**: `next build` with `output: "export"` produces
  a pure static site in `./out`.  All pages and assets are bundled as
  pre-rendered HTML + JS.
- **Capacitor**: wraps the static export into a native Android WebView.
  The Capacitor config points `webDir` at `./out`.
- **sql.js + IndexedDB**: all session data, products, and settings are
  stored locally on the device — no network connection required, ever.

Install the APK and go.

---

## Build the APK (Windows dev machine)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
```

This runs:

1. `next build` — statically exports the app into `./out`
2. `npx cap sync android` — copies `./out` into the Android project
3. `android\gradlew.bat assembleDebug` — produces a debug-signed APK

The final APK is at:
```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Prerequisites

- **Node.js 22+** and npm installed and on PATH
- **Android SDK** — set `ANDROID_HOME` environment variable
  (typically `C:\Users\<you>\AppData\Local\Android\Sdk`)
- **JDK 17+** — verify with `java -version`

If you haven't added the Android platform yet, run this once first:
```bash
npx cap add android
```

---

## Install on the tablet

1. Transfer the APK to the tablet (Google Drive, USB, email, etc.).
2. Open the APK file on the tablet.
3. If prompted, allow installation from unknown sources / file manager.
4. Open the مقهى ترف app.

No configuration needed.  The app opens directly to the floor view.

---

## Protect your data (backup / export)

Since the app runs entirely offline on a single device, data protection
is your responsibility.  The app includes an in-app backup and export
flow (the UI is being built by the mobile team).  Once available:

1. Open the **Settings** screen from the dashboard.
2. Tap **Export / Backup**.
3. Choose **Export to file** to save a JSON snapshot of all sessions,
   products, and settings.  The file can be saved to the device's
   Downloads folder, Google Drive, or shared via email.
4. To restore, use the **Import from file** option on the same screen.

**Recommended practice**: export a backup at the end of every shift or
at least daily.  Keep backups on a separate device or cloud storage so
they survive a lost or broken tablet.

---

## Troubleshooting

### App crashes on launch

If the app crashes immediately after installation, try:

1. **Reinstall**: uninstall the app, reboot the tablet, install again.
2. **Clear storage**: if reinstalling doesn't help, the IndexedDB
   database may be corrupted.  Go to Android Settings → Apps →
   مقهى ترف → Storage → Clear storage, then relaunch.
3. **Rebuild**: ensure you ran `next build` successfully before
   `cap sync` — a failed build produces a broken `./out`.

### "App not installed" error (APK install fails)

- Ensure **Install from unknown sources** is enabled in Android settings.
- If you're installing over an older version, the APK must have the
  same (or higher) `versionCode` in `android/app/build.gradle`.

### Data loss after reinstall

IndexedDB is device-local.  Uninstalling the app wipes all data.
Always export a backup before uninstalling — see "Protect your data"
above.
