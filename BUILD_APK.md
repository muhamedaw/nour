# Get the Nour POS APK on your Android

You don't need to install Android Studio, Java, or anything else. GitHub
builds the APK for you in the cloud, for free. Takes about 10 minutes
the first time, ~5 minutes for every build after that.

## Step 1 — Create a free GitHub account & repo (5 min)

If you don't have a GitHub account:

1. Open **https://github.com/signup** and create one (free, no card).

Then create a new repository for this project:

1. Go to **https://github.com/new**
2. **Repository name:** `nour-pos` (or anything you like)
3. **Visibility:** `Private` is fine — only you can see it.
4. **DO NOT** tick "Add a README", "Add .gitignore", or "Choose a
   license". The repo must be empty.
5. Click **Create repository**.

GitHub will show you a "Quick setup" page with a URL like:

```
https://github.com/YOUR-USERNAME/nour-pos.git
```

Copy that URL — you'll need it in Step 2.

## Step 2 — Push the project to GitHub (2 min)

Open the project folder in a terminal and run these 4 commands. Paste
the URL from Step 1 where it says `YOUR-REPO-URL`:

```bash
git remote add origin YOUR-REPO-URL
git add -A
git commit -m "Add APK build workflow"
git push -u origin master
```

> **Note:** If the last command fails with "src refspec master does not
> match any", run `git branch -M main` first, then re-run
> `git push -u origin main`. Some recent Git installs use `main` as the
> default branch name.

When prompted, sign in with your GitHub username + a **Personal Access
Token** (NOT your password — GitHub stopped accepting passwords in
August 2021). To create a token:

1. Go to **https://github.com/settings/tokens/new**
2. **Note:** `nour-pos push`
3. **Expiration:** 30 days (or whatever you prefer)
4. **Scopes:** tick only `repo` (the first checkbox)
5. Click **Generate token** → copy the token (it looks like
   `ghp_xxxxxxxxxxxx`)
6. Paste that token when the terminal asks for your password.

## Step 3 — Wait for the build (5-10 min)

1. Open your repo on GitHub → click the **Actions** tab.
2. You'll see a yellow "Build Android APK" run in progress.
3. Click it to watch the logs. The slow steps are:
   - "Setup Android SDK" — downloads SDK + build-tools (~1 GB, 1-2 min)
   - "Build static export" — builds the web bundle (~1 min)
   - "Build debug APK" — Gradle compiles + packages (~3-5 min)
4. When the run turns **green ✓**, scroll to the bottom of the page.

## Step 4 — Download & install the APK (1 min)

1. At the bottom of the workflow page, find the **Artifacts** section.
2. Click **app-debug-apk** to download a `.zip` file.
3. Unzip it on your computer — you get `app-debug.apk`.
4. Get the `.apk` to your Android phone. Easiest ways:
   - **USB cable:** copy `app-debug.apk` to the phone's Downloads folder
   - **Telegram / WhatsApp:** send it to yourself
   - **Google Drive / Dropbox:** upload from PC, download on phone
   - **Email:** attach it to an email to yourself
5. On the phone, open the file. Android will say "Install blocked —
   for your security, your phone is not allowed to install unknown
   apps from this source." Tap **Settings** → enable **Allow from this
   source** → go back → tap **Install**.
6. The app is now on your phone. The icon says **نور — أرضية الكوفي**.
7. **First launch only:** Android will ask to allow access to
   storage / network — say **Allow** to both.

## Future builds

Any time you want a new APK:

1. Make code changes in the project.
2. `git add -A && git commit -m "..." && git push`
3. Wait 5 min → download the new APK from the Actions tab.

Or, without changing code:

1. Go to the repo → **Actions** tab → **Build Android APK** →
   **Run workflow** → green button.

## Troubleshooting

- **Build fails at "Setup Android SDK":** usually a transient
  network blip. Re-run the workflow: Actions tab → failed run →
  **Re-run jobs**.
- **Build fails at "Build static export":** look at the log — most
  often it's a TypeScript error in code I just wrote. Fix the error,
  push again.
- **APK installs but crashes on launch:** open the app, shake the
  device → Chrome DevTools will show the error. (Only works because
  `webContentsDebuggingEnabled: true` is set in `capacitor.config.ts`.)
- **"App not installed" on Android:** the most common cause is that a
  previous version is already installed with a different signature.
  Long-press the old app icon → **Uninstall** → try again.

## What's inside the APK

- **Offline-only:** all data lives in a WebView-local SQLite database
  inside the app. No LAN server, no internet connection needed.
- **Real (not a wrapper):** it's a real Android app, not a shortcut to
  a website. You can use it with WiFi off.
- **Debug-signed:** the APK is signed with the standard Android debug
  keystore, so it installs without any signing setup. It is NOT
  Play-Store-ready; for that, wire up a release signing config in
  `android/app/build.gradle` and switch to `./gradlew assembleRelease`.
