#!/bin/bash
# Build script — detects project type and runs the appropriate build

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Building project at: $ROOT"

if [ -f "package.json" ]; then
  echo "Detected: Node.js project"
  npm install
  npm run build
elif [ -f "pyproject.toml" ] || [ -f "requirements.txt" ]; then
  echo "Detected: Python project"
  [ -d ".venv" ] || python -m venv .venv
  source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate
  pip install -r requirements.txt 2>/dev/null || pip install -e .
  echo "Python dependencies installed."
elif [ -f "Cargo.toml" ]; then
  echo "Detected: Rust project"
  cargo build --release
elif [ -f "go.mod" ]; then
  echo "Detected: Go project"
  go build ./...
else
  echo "Unknown project type — add build steps to this file."
  exit 1
fi

echo "Build complete."
