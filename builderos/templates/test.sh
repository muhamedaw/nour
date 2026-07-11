#!/bin/bash
# Test runner — detects framework and runs all tests

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Running tests..."

if [ -f "package.json" ]; then
  if grep -q '"jest"' package.json 2>/dev/null; then
    npx jest --passWithNoTests
  elif grep -q '"vitest"' package.json 2>/dev/null; then
    npx vitest run
  else
    npm test
  fi
elif [ -f "pyproject.toml" ] || [ -f "pytest.ini" ] || [ -d "tests" ]; then
  source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null || true
  pytest tests/ -v --tb=short
elif [ -f "Cargo.toml" ]; then
  cargo test
elif [ -f "go.mod" ]; then
  go test ./... -v
else
  echo "No test framework detected. Add test setup to scripts/test.sh"
  exit 1
fi

echo "All tests passed."
