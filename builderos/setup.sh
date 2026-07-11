#!/bin/bash
# BuilderOS one-command installer.
# Copies BuilderOS into a target project as builderos/ and wires the root
# CLAUDE.md so Claude auto-activates the Autonomous Build Protocol.
#
# Usage:  bash setup.sh [target-project-dir]   (default: current directory)
set -euo pipefail

BOS_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$(cd "${1:-.}" && pwd)"
DEST="$TARGET/builderos"

if [ "$TARGET" = "$BOS_DIR" ]; then
    echo "Error: target is the BuilderOS folder itself. Pass a project dir."
    exit 1
fi

echo "Installing BuilderOS -> $DEST"
mkdir -p "$DEST"

# Copy everything except VCS / caches / the installer's own copy target.
for item in "$BOS_DIR"/* "$BOS_DIR"/.gitignore "$BOS_DIR"/.env.example "$BOS_DIR"/.github; do
    [ -e "$item" ] || continue
    base="$(basename "$item")"
    case "$base" in
        builderos|.git|__pycache__|node_modules) continue ;;
    esac
    cp -r "$item" "$DEST/"
done

# Prune caches that may have been copied from nested dirs.
find "$DEST" -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true

# Wire the project-root CLAUDE.md (auto-loaded by Claude Code).
ACTIVATOR="$DEST/templates/project-CLAUDE.md"
ROOT_CLAUDE="$TARGET/CLAUDE.md"
MARKER="@builderos/AUTONOMOUS_BUILD.md"

if [ ! -f "$ROOT_CLAUDE" ]; then
    cp "$ACTIVATOR" "$ROOT_CLAUDE"
    echo "Created $ROOT_CLAUDE"
elif ! grep -qF "$MARKER" "$ROOT_CLAUDE"; then
    {
        echo ""
        echo "<!-- BuilderOS -->"
        cat "$ACTIVATOR"
    } >> "$ROOT_CLAUDE"
    echo "Appended BuilderOS brain to existing $ROOT_CLAUDE"
else
    echo "$ROOT_CLAUDE already wired."
fi

# Auto-start Claude Code (plan mode) + local free Plan Chat on folder open.
# Overwrites only our own managed tasks.json (identified by the task label).
TASKS="$TARGET/.vscode/tasks.json"
if [ ! -f "$TASKS" ] || grep -qF "Claude Code (plan mode)" "$TASKS"; then
    mkdir -p "$TARGET/.vscode"
    cp -f "$DEST/templates/project-tasks.json" "$TASKS"
    echo "Wired .vscode/tasks.json (Claude plan mode + local Plan Chat on folder open)."
fi

# Force BuilderOS every session via project hooks (harness-enforced, not optional).
# Resolve a python that actually RUNS (skips the broken Windows Store python3 stub).
PY=""
for c in python python3 py; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys' >/dev/null 2>&1; then
        PY="$c"; break
    fi
done
if [ -n "$PY" ]; then
    "$PY" "$DEST/scripts/install_hooks.py" "$TARGET" || echo "note: hook install skipped."
    "$PY" "$DEST/scripts/build_skill_index.py" >/dev/null 2>&1 || true
    "$PY" "$DEST/scripts/install_skills.py" --always --project "$TARGET" >/dev/null 2>&1 || true
    SKILL_COUNT=$(ls -d "$DEST/skills"/*/ 2>/dev/null | wc -l | tr -d ' ')
    echo "Skill library: $SKILL_COUNT skills bundled; base installed, rest auto-match per idea."
else
    echo "note: python not found; skipped .claude/settings.json hooks and skills."
fi

echo ""
echo "Done. Open Claude Code in: $TARGET"
echo "Then type one line, e.g.:  build me a markdown note-taking CLI with add/list/search"
