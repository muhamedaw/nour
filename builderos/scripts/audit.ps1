# Builder OS — Project Audit Script
# Usage: powershell -ExecutionPolicy Bypass -File audit.ps1 [project-path]

param(
    [string]$ProjectPath = (Get-Location).Path
)

$ProjectPath = $ProjectPath.Trim('"').Trim("'")
$resolved = Resolve-Path $ProjectPath -ErrorAction SilentlyContinue
if (-not $resolved) {
    Write-Host "ERROR: Path not found: $ProjectPath" -ForegroundColor Red
    exit 1
}
$ProjectPath = $resolved.Path

Write-Host ""
Write-Host "=== BUILDER OS - PROJECT AUDIT ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectPath" -ForegroundColor White
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor White
Write-Host ""

$issues = @()
$passes = @()

function Check-Exists {
    param([string]$Label, [string[]]$Paths, [string]$Fix)
    $found = $false
    foreach ($p in $Paths) {
        if (Test-Path (Join-Path $ProjectPath $p)) { $found = $true; break }
    }
    if ($found) {
        $script:passes += $Label
        Write-Host "  [OK] $Label" -ForegroundColor Green
    } else {
        $script:issues += @{ Label = $Label; Fix = $Fix }
        Write-Host "  [MISSING] $Label" -ForegroundColor Red
        Write-Host "     -> $Fix" -ForegroundColor DarkYellow
    }
}

Write-Host "-- Code Quality --" -ForegroundColor Yellow
Check-Exists "Linter" @(".eslintrc.json", "eslint.config.js", "eslint.config.mjs", ".pylintrc", "pyproject.toml", "ruff.toml") "Add ESLint (JS) or Ruff (Python)"
Check-Exists "Formatter" @(".prettierrc", ".prettierrc.json", "prettier.config.js", ".editorconfig", "pyproject.toml") "Add Prettier (JS) or Black config (Python)"
Check-Exists "TypeScript" @("tsconfig.json") "Run: npx tsc --init"

Write-Host ""
Write-Host "-- Testing --" -ForegroundColor Yellow
Check-Exists "Test directory" @("tests", "test", "__tests__", "spec") "Create tests/ directory"
Check-Exists "Test config" @("jest.config.js", "jest.config.ts", "vitest.config.ts", "pytest.ini", "pyproject.toml") "Add jest.config.ts or pytest.ini"

Write-Host ""
Write-Host "-- Automation Scripts --" -ForegroundColor Yellow
Check-Exists "audit.sh" @("audit.sh", "scripts/audit.sh") "Copy from BuilderOS/templates/audit.sh"
Check-Exists "build.sh" @("build.sh", "scripts/build.sh") "Copy from BuilderOS/templates/build.sh"
Check-Exists "dev.sh" @("dev.sh", "scripts/dev.sh") "Copy from BuilderOS/templates/dev.sh"
Check-Exists "test.sh" @("test.sh", "scripts/test.sh") "Copy from BuilderOS/templates/test.sh"
Check-Exists "clean.sh" @("clean.sh", "scripts/clean.sh") "Copy from BuilderOS/templates/clean.sh"

Write-Host ""
Write-Host "-- Security --" -ForegroundColor Yellow
Check-Exists ".gitignore" @(".gitignore") "CRITICAL: create .gitignore before first commit"
Check-Exists ".env.example" @(".env.example", ".env.template") "Add .env.example to document required env vars"

Write-Host ""
Write-Host "-- Docker / DevOps --" -ForegroundColor Yellow
Check-Exists "Docker" @("Dockerfile", "docker-compose.yml", "docker-compose.yaml") "Add Dockerfile + docker-compose.yml"
Check-Exists "CI/CD" @(".github/workflows") "Add GitHub Actions workflow"

Write-Host ""
Write-Host "-- Documentation --" -ForegroundColor Yellow
Check-Exists "README" @("README.md", "README.txt") "Add README.md with setup instructions"

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Passed : $($passes.Count)" -ForegroundColor Green
Write-Host "Missing: $($issues.Count)" -ForegroundColor Red
Write-Host ""

if ($issues.Count -gt 0) {
    Write-Host "Fix before feature development:" -ForegroundColor Yellow
    foreach ($issue in $issues) {
        Write-Host "  - $($issue.Label): $($issue.Fix)" -ForegroundColor White
    }
} else {
    Write-Host "Project infrastructure is complete." -ForegroundColor Green
}
Write-Host ""
