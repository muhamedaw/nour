#!/bin/bash
# Clean script — removes build artifacts, caches, temp files

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Cleaning project..."

# Node.js
rm -rf .next out dist build .turbo node_modules/.cache
echo "  Removed: .next, dist, build caches"

# Python
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true
rm -rf .pytest_cache .coverage htmlcov/ .ruff_cache
echo "  Removed: Python cache files"

# Rust
[ -f "Cargo.toml" ] && cargo clean 2>/dev/null || true

# General
rm -rf .cache tmp/ temp/ logs/*.log 2>/dev/null || true

echo "Clean complete."
