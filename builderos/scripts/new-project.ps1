# Builder OS — New Project Initializer
# Usage: powershell -ExecutionPolicy Bypass -File new-project.ps1 [project-path]

param(
    [string]$ProjectPath = ""
)

# Derive the BuilderOS root from this script's location (scripts/ -> parent).
$BuilderOSRoot = Split-Path -Parent $PSScriptRoot

if ($ProjectPath -eq "") {
    Write-Host ""
    Write-Host "=== BUILDER OS - New Project Setup ===" -ForegroundColor Cyan
    $ProjectPath = Read-Host "Enter project path (or press Enter for current directory)"
    if ($ProjectPath -eq "") {
        $ProjectPath = (Get-Location).Path
    }
}

# Strip surrounding quotes if drag-dropped
$ProjectPath = $ProjectPath.Trim('"').Trim("'")

if (-not (Test-Path $ProjectPath)) {
    New-Item -ItemType Directory -Force -Path $ProjectPath | Out-Null
    Write-Host "Created directory: $ProjectPath" -ForegroundColor Green
}

$ProjectPath = (Resolve-Path $ProjectPath).Path

Write-Host ""
Write-Host "Initializing Builder OS in: $ProjectPath" -ForegroundColor Cyan

# 1. Create scripts directory
$scriptsDir = Join-Path $ProjectPath "scripts"
if (-not (Test-Path $scriptsDir)) {
    New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
}

# 2. Copy shell script templates
$templates = @("audit.sh", "build.sh", "dev.sh", "test.sh", "clean.sh")
foreach ($tpl in $templates) {
    $src = Join-Path $BuilderOSRoot "templates\$tpl"
    $dst = Join-Path $scriptsDir $tpl
    if ((Test-Path $src) -and (-not (Test-Path $dst))) {
        Copy-Item $src $dst
        Write-Host '  [+] scripts/' $tpl -ForegroundColor Green -Separator ''
    }
}

# 3. Create .gitignore if missing
$gitignorePath = Join-Path $ProjectPath ".gitignore"
if (-not (Test-Path $gitignorePath)) {
    $gitignoreContent = @'
# Environment
.env
.env.local
.env.*.local

# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# Build output
dist/
build/
.next/
out/

# Editor
.vscode/settings.json
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Testing
coverage/
.coverage

# Knowledge graph (regenerable via graphify)
graphify-out/
'@
    Set-Content -Path $gitignorePath -Value $gitignoreContent -Encoding utf8
    Write-Host '  [+] .gitignore' -ForegroundColor Green
}

# 4. Create .env.example if missing
$envExamplePath = Join-Path $ProjectPath ".env.example"
if (-not (Test-Path $envExamplePath)) {
    $envContent = @'
# Copy this file to .env and fill in your values
# Never commit .env to git

# App
APP_NAME=my-app
APP_ENV=development
APP_PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
REDIS_URL=redis://localhost:6379

# Auth
SECRET_KEY=change-this-in-production
'@
    Set-Content -Path $envExamplePath -Value $envContent -Encoding utf8
    Write-Host '  [+] .env.example' -ForegroundColor Green
}

# 5. Create README if missing
$readmePath = Join-Path $ProjectPath "README.md"
$projectName = Split-Path -Leaf $ProjectPath
if (-not (Test-Path $readmePath)) {
    $readmeContent = "# $projectName`n`nBuilt with Builder OS.`n`n## Setup`n`n``````bash`ncp .env.example .env`nbash scripts/dev.sh`n``````"
    $readmeContent += "`n`n## Scripts`n`n| Script | Purpose |`n|--------|---------|`n| scripts/dev.sh | Start dev environment |`n| scripts/build.sh | Build for production |`n| scripts/test.sh | Run tests |`n| scripts/audit.sh | Project health audit |`n| scripts/clean.sh | Remove build artifacts |"
    Set-Content -Path $readmePath -Value $readmeContent -Encoding utf8
    Write-Host '  [+] README.md' -ForegroundColor Green
}

# 6. Init git if not already
$gitDir = Join-Path $ProjectPath ".git"
if (-not (Test-Path $gitDir)) {
    Push-Location $ProjectPath
    git init | Out-Null
    Pop-Location
    Write-Host '  [+] git initialized' -ForegroundColor Green
}

Write-Host ""
Write-Host "Builder OS initialized in: $ProjectPath" -ForegroundColor Green
Write-Host ""

# Install the full BuilderOS system (builderos/ copy, CLAUDE.md activator, hooks, skill library)
Write-Host "Installing BuilderOS (brain + hooks + skills)..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File "$BuilderOSRoot\setup.ps1" "$ProjectPath"

# Run audit
Write-Host "Running project audit..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File "$BuilderOSRoot\scripts\audit.ps1" "$ProjectPath"
