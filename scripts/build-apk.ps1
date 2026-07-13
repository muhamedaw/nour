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

# --- Step OTA (optional): publish an OTA update bundle to Supabase --------
# Zips ./out, hashes it, and uploads {version}.zip + a latest.json manifest
# to the same Supabase Storage bucket the app's hourly cloud backup uses
# (lib/cloud/backup.ts) — but under app-updates/, and authenticated with a
# SEPARATE service_role key read only from .env.local (gitignored,
# developer-machine only). This key must never reach the APK: it only runs
# here, at build time, on the dev machine — the app itself only ever reads
# the public, unauthenticated app-updates/latest.json (see lib/cloud/ota.ts)
# with the low-privilege anon key used for backups, never this one.
#
# Skips silently (does not fail the APK build) if .env.local doesn't have
# OTA publishing configured yet — this is an opt-in feature, not every dev
# machine needs it wired up to produce a working APK.
$EnvLocalPath = Join-Path $ProjectRoot ".env.local"
$OtaEnv = @{}
if (Test-Path $EnvLocalPath) {
  Get-Content $EnvLocalPath | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $parts = $_.Split('=', 2)
    $OtaEnv[$parts[0].Trim()] = $parts[1].Trim()
  }
}
$OtaUrl = $OtaEnv['SUPABASE_URL']
$OtaBucket = $OtaEnv['SUPABASE_BUCKET']
$OtaServiceKey = $OtaEnv['SUPABASE_SERVICE_ROLE_KEY']

if ($OtaUrl -and $OtaBucket -and $OtaServiceKey) {
  Write-Host "[OTA] Publishing update bundle to Supabase..."
  # Timestamp-based version — always monotonically increasing across builds
  # with zero coordination needed against package.json's version field,
  # so an app on an older bundle always sees a strictly newer one here.
  $Version = Get-Date -Format "yyyyMMddHHmmss"
  $ZipPath = Join-Path $ProjectRoot "out-$Version.zip"

  try {
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
    Compress-Archive -Path "$OutDir\*" -DestinationPath $ZipPath -Force
    $Sha256 = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()

    $BaseUrl = $OtaUrl.TrimEnd('/')
    $ZipObjectUrl = "$BaseUrl/storage/v1/object/$OtaBucket/app-updates/$Version.zip"
    $PublicZipUrl = "$BaseUrl/storage/v1/object/public/$OtaBucket/app-updates/$Version.zip"
    $ManifestObjectUrl = "$BaseUrl/storage/v1/object/$OtaBucket/app-updates/latest.json"

    $Headers = @{
      "apikey"        = $OtaServiceKey
      "Authorization" = "Bearer $OtaServiceKey"
      "x-upsert"      = "true"
    }

    Invoke-WebRequest -Uri $ZipObjectUrl -Method Put -Headers $Headers `
      -ContentType "application/zip" -InFile $ZipPath | Out-Null

    $Manifest = @{ version = $Version; url = $PublicZipUrl; sha256 = $Sha256 } | ConvertTo-Json -Compress
    Invoke-WebRequest -Uri $ManifestObjectUrl -Method Put -Headers $Headers `
      -ContentType "application/json" -Body $Manifest | Out-Null

    Write-Host "  OK — published version $Version ($Sha256)"
  } catch {
    # OTA publishing failure must never fail the APK build itself — the
    # debug APK is still valid even if the cloud manifest push failed.
    Write-Warning "OTA publish failed: $($_.Exception.Message)"
  } finally {
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  }
  Write-Host ""
} else {
  Write-Host "[OTA] Skipped — SUPABASE_URL / SUPABASE_BUCKET / SUPABASE_SERVICE_ROLE_KEY not set in .env.local"
  Write-Host ""
}

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
