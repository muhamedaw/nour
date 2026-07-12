<#
.SYNOPSIS
  Build the offline-only Nour POS APK — static export + Capacitor + Gradle.

.DESCRIPTION
  This script:
    1. Runs `next build` to statically export the app into ./out
    2. Runs `npx cap sync android` to copy ./out into the Android project
    3. Runs Gradle's assembleDebug to produce a debug-signed APK
    4. Prints the resulting .apk file path

  No server, no LAN setup needed.  The APK is fully self-contained.

  Prerequisites:
    - Node.js 22+ and npm installed and on PATH
    - Android SDK installed with ANDROID_HOME or ANDROID_SDK_ROOT set
    - JDK 17+ installed and on PATH
    - Gradle (bundled via android/gradlew) — no separate install needed

  Run from the project root:
    powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1

  The final APK will be at:
    android\app\build\outputs\apk\debug\app-debug.apk
#>

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $ProjectRoot

Write-Host "=== Nour POS APK Build (offline) ==="
Write-Host "Project root: $ProjectRoot"
Write-Host ""

# --- Step 1: Next.js static export ---------------------------------------
Write-Host "[1/4] Running next build (static export)..."
$Build = & npx.cmd next build 2>&1
$BuildExit = $LASTEXITCODE
if ($BuildExit -ne 0) {
  Write-Host $Build
  Write-Error "next build failed (exit code $BuildExit)"
  exit 1
}
Write-Host "  OK"
Write-Host ""

# --- Step 2: Verify ./out was produced -----------------------------------
$OutDir = Join-Path $ProjectRoot "out"
if (-not (Test-Path $OutDir)) {
  Write-Error "Static export directory not found at $OutDir — did next build succeed?"
  exit 1
}
Write-Host "[2/4] Static export produced at $OutDir"
Write-Host ""

# --- Step 3: Capacitor sync ----------------------------------------------
Write-Host "[3/4] Running npx cap sync android..."
$Sync = & npx.cmd cap sync android 2>&1
$SyncExit = $LASTEXITCODE
if ($SyncExit -ne 0) {
  Write-Host $Sync
  Write-Error "cap sync failed (exit code $SyncExit)"
  exit 1
}
Write-Host "  OK"
Write-Host ""

# --- Step 4: Gradle assembleDebug ----------------------------------------
Write-Host "[4/4] Running Gradle assembleDebug..."
$Gradlew = Join-Path $ProjectRoot "android\gradlew.bat"
if (-not (Test-Path $Gradlew)) {
  Write-Error "Gradle wrapper not found at $Gradlew — has 'npx cap add android' been run?"
  exit 1
}

$Gradle = & $Gradlew --project-dir "$ProjectRoot\android" assembleDebug 2>&1
$GradleExit = $LASTEXITCODE
if ($GradleExit -ne 0) {
  Write-Host $Gradle
  Write-Error "Gradle build failed (exit code $GradleExit)"
  Write-Host ""
  Write-Host "Troubleshooting:"
  Write-Host "  - Ensure ANDROID_HOME is set (e.g. C:\Users\$env:USERNAME\AppData\Local\Android\Sdk)"
  Write-Host "  - Ensure JDK 17+ is on PATH (run 'java -version')"
  exit 1
}
Write-Host "  OK"
Write-Host ""

# --- Result --------------------------------------------------------------
$ApkPath = Join-Path $ProjectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $ApkPath) {
  $Size = (Get-Item $ApkPath).Length / 1MB
  Write-Host "=== Build complete! ==="
  Write-Host "  APK: $ApkPath"
  Write-Host "  Size: $([math]::Round($Size, 1)) MB"
} else {
  Write-Warning "Expected APK not found at $ApkPath"
  Write-Host "Check android\app\build\outputs\apk for the actual file."
}
