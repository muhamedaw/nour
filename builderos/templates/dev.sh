#!/bin/bash
# Dev environment launcher — starts all services for local development

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load env
[ -f ".env" ] || { echo "No .env file — copy .env.example first."; exit 1; }

echo "Starting development environment..."

# Docker services (db, redis, etc.) if compose exists
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ]; then
  docker compose up -d
  echo "Docker services started."
fi

# Start app server
if [ -f "package.json" ]; then
  npm run dev
elif [ -f "pyproject.toml" ] || [ -f "main.py" ] || [ -f "app/main.py" ]; then
  source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null || true
  if grep -q "fastapi" requirements.txt 2>/dev/null || grep -q "fastapi" pyproject.toml 2>/dev/null; then
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  else
    python main.py
  fi
elif [ -f "Cargo.toml" ] && grep -q "tauri" Cargo.toml 2>/dev/null; then
  cargo tauri dev
else
  echo "Add your dev start command to scripts/dev.sh"
fi
