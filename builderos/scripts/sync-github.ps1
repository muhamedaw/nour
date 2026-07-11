# Builder OS — GitHub Auto-Sync
# Called by Claude Code Stop hook after every session.
# Commits and pushes any registry changes to GitHub.

# Derive the BuilderOS root from this script's location (scripts/ -> parent).
$BuilderOSPath = Split-Path -Parent $PSScriptRoot

Set-Location $BuilderOSPath

# Check if this is a git repo
if (-not (Test-Path ".git")) {
    Write-Host "[BuilderOS] Not a git repo yet. Run: git init && git remote add origin <url>" -ForegroundColor Yellow
    exit 0
}

# Check for changes in registry files
$changedFiles = git status --porcelain 2>$null
if (-not $changedFiles) {
    Write-Host "[BuilderOS] No registry changes to sync." -ForegroundColor Cyan
    exit 0
}

# Stage only registry and documentation files (not code)
$filesToStage = @(
    "TOOL_REGISTRY.md",
    "SKILLS_REGISTRY.md",
    "CLAUDE.md",
    "README.md"
)

$staged = $false
foreach ($file in $filesToStage) {
    if (Test-Path $file) {
        $fileStatus = git status --porcelain $file 2>$null
        if ($fileStatus) {
            git add $file
            $staged = $true
        }
    }
}

if (-not $staged) {
    Write-Host "[BuilderOS] No registry files changed." -ForegroundColor Cyan
    exit 0
}

# Commit with timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

git commit -m "auto-sync: registry update $timestamp"

# Push to GitHub
$remote = git remote 2>$null
if ($remote) {
    git push origin main 2>$null
    if ($?) {
        Write-Host "[BuilderOS] Registry synced to GitHub." -ForegroundColor Green
    } else {
        Write-Host "[BuilderOS] Push failed — check GitHub remote config." -ForegroundColor Red
    }
} else {
    Write-Host "[BuilderOS] No remote configured. Changes committed locally only." -ForegroundColor Yellow
    Write-Host "[BuilderOS] To push: git remote add origin <github-url> && git push -u origin main" -ForegroundColor Yellow
}
