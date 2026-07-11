#!/bin/bash
# Project health audit — checks code quality, tests, security, deps

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0

check() {
  local label="$1"; shift
  local found=false
  for p in "$@"; do
    [ -e "$ROOT/$p" ] && found=true && break
  done
  if $found; then
    echo "  [OK] $label"; PASS=$((PASS+1))
  else
    echo "  [MISSING] $label"; FAIL=$((FAIL+1))
  fi
}

echo ""
echo "=== PROJECT AUDIT ==="
echo "Root: $ROOT"
echo ""

echo "-- Code Quality --"
check "Linter"      ".eslintrc*" "eslint.config*" ".pylintrc" "ruff.toml" "pyproject.toml"
check "Formatter"   ".prettierrc*" "prettier.config*" ".editorconfig"
check "TypeScript"  "tsconfig.json"

echo ""
echo "-- Testing --"
check "Test dir"    "tests" "test" "__tests__" "spec"
check "Test config" "jest.config*" "vitest.config*" "pytest.ini"

echo ""
echo "-- Security --"
check ".gitignore"  ".gitignore"
check ".env.example" ".env.example" ".env.template"

echo ""
echo "-- Docker --"
check "Dockerfile"  "Dockerfile"
check "Compose"     "docker-compose.yml" "docker-compose.yaml"

echo ""
echo "-- CI/CD --"
check "GitHub Actions" ".github/workflows"

echo ""
echo "=== SUMMARY: $PASS passed, $FAIL missing ==="
echo ""
[ $FAIL -gt 0 ] && exit 1 || exit 0
