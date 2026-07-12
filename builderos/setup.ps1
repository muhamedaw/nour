# BuilderOS one-command installer (Windows).
# Copies BuilderOS into a target project as builderos\ and wires the root
# CLAUDE.md so Claude auto-activates the Autonomous Build Protocol.
#
# Usage:  powershell -ExecutionPolicy Bypass -File setup.ps1 [target-project-dir]
param(
    [string]$Target = "."
)

$BosDir = $PSScriptRoot
$Target = (Resolve-Path $Target).Path
$Dest = Join-Path $Target "builderos"

if ($Target -eq $BosDir) {
    Write-Host "Error: target is the BuilderOS folder itself. Pass a project dir." -ForegroundColor Red
    exit 1
}

Write-Host "Installing BuilderOS -> $Dest" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

# Copy everything except VCS / caches / the install target itself.
$skip = @("builderos", ".git", "__pycache__", "node_modules")
Get-ChildItem -Path $BosDir -Force | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
    Copy-Item $_.FullName -Destination $Dest -Recurse -Force
}

# Prune caches that may have been copied from nested dirs.
Get-ChildItem -Path $Dest -Recurse -Directory -Force -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

# Wire the project-root CLAUDE.md (auto-loaded by Claude Code).
$activator = Join-Path $Dest "templates\project-CLAUDE.md"
$rootClaude = Join-Path $Target "CLAUDE.md"
$marker = "@builderos/AUTONOMOUS_BUILD.md"

if (-not (Test-Path $rootClaude)) {
    Copy-Item $activator $rootClaude
    Write-Host "Created $rootClaude" -ForegroundColor Green
} elseif (-not (Select-String -Path $rootClaude -SimpleMatch $marker -Quiet)) {
    Add-Content -Path $rootClaude -Value "`n<!-- BuilderOS -->`n"
    Add-Content -Path $rootClaude -Value (Get-Content $activator -Raw)
    Write-Host "Appended BuilderOS brain to existing $rootClaude" -ForegroundColor Green
} else {
    Write-Host "$rootClaude already wired." -ForegroundColor Yellow
}

# Auto-start Claude Code (plan mode) + local free Plan Chat on folder open.
# Overwrites only our own managed tasks.json (identified by the task label).
$vscodeDir = Join-Path $Target ".vscode"
$tasksPath = Join-Path $vscodeDir "tasks.json"
$managed = (-not (Test-Path $tasksPath)) -or
           (Select-String -Path $tasksPath -SimpleMatch "Claude Code (plan mode)" -Quiet)
if ($managed) {
    New-Item -ItemType Directory -Force -Path $vscodeDir | Out-Null
    Copy-Item (Join-Path $Dest "templates\project-tasks.json") $tasksPath -Force
    Write-Host "Wired .vscode/tasks.json (Claude plan mode + local Plan Chat on folder open)." -ForegroundColor Green
}

# Force BuilderOS every session via project hooks (harness-enforced, not optional).
$py = (Get-Command python -ErrorAction SilentlyContinue)
if ($null -eq $py) { $py = (Get-Command python3 -ErrorAction SilentlyContinue) }
if ($null -ne $py) {
    & $py.Source (Join-Path $Dest "scripts\install_hooks.py") $Target
    & $py.Source (Join-Path $Dest "scripts\build_skill_index.py") | Out-Null
    # Lean by design: install only base skills now; the rest match per prompt.
    & $py.Source (Join-Path $Dest "scripts\install_skills.py") "--always" "--project" $Target | Out-Null
    $skillCount = (Get-ChildItem -Path (Join-Path $Dest "skills") -Directory).Count
    Write-Host "Skill library: $skillCount skills available; base installed, rest chosen per prompt (local or fetched)." -ForegroundColor Green
} else {
    Write-Host "note: python not found; skipped .claude/settings.json hooks and skills." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Open Claude Code in: $Target" -ForegroundColor Green
Write-Host "Then type one line, e.g.:  build me a markdown note-taking CLI with add/list/search"
