#!/bin/bash
# BuilderOS CLI (gh2) - v3.0
set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATES_DIR="$BASE_DIR/templates"
# Resolve a python that actually runs (skips broken Windows Store python3 stub).
PY="python"
for c in python python3 py; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys' >/dev/null 2>&1; then
        PY="$c"; break
    fi
done

echo "BuilderOS CLI - v3.0"

usage() {
    echo "Usage: gh2 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  architect \"<description>\"             Generate a blueprint from natural language"
    echo "  init <template-name> <project-path>  Initialize a new project from a template"
    echo "  blueprint <blueprint-file>           Apply a blueprint to the current project"
    echo "  deploy                               Deploy the current project (Vercel/Docker)"
    echo "  secrets [.env path] [VAR ...]        Initialize an env file with generated secrets"
    echo "  shrink                               Compress project context for AI efficiency"
    echo "  docs                                 Generate PROJECT_DOCS.md from the codebase"
    echo "  audit                                Audit the current project for missing tools"
    echo "  eval                                 Score architect output quality (regression gate)"
    echo "  log \"<message>\"                       Append a decision to SESSION_LOG.md"
    echo ""
    echo "Templates:"
    ls "$TEMPLATES_DIR"
}

case "${1:-}" in
  architect)
    shift
    BUILD=false
    if [ "${1:-}" = "--build" ]; then BUILD=true; shift; fi
    if [ -z "${1:-}" ]; then
        echo "Error: provide a project description."
        echo "Usage: gh2 architect [--build] \"<description>\""
        exit 1
    fi
    echo "Generating blueprint from description..."
    "$PY" "$BASE_DIR/core/architect/ai_planner.py" "$*" --out blueprint.json
    if [ "$BUILD" = true ]; then
        echo "Applying generated blueprint..."
        "$PY" "$BASE_DIR/core/blueprint_processor.py" blueprint.json
    fi
    ;;

  init)
    TEMPLATE=${2:-}
    DEST=${3:-}
    if [ -z "$TEMPLATE" ] || [ -z "$DEST" ]; then
        usage
        exit 1
    fi
    
    if [ ! -d "$TEMPLATES_DIR/$TEMPLATE" ]; then
        echo "Error: Template '$TEMPLATE' not found."
        exit 1
    fi
    
    echo "Initializing new project from '$TEMPLATE' into '$DEST'..."
    mkdir -p "$DEST"
    cp -r "$TEMPLATES_DIR/$TEMPLATE/." "$DEST/"
    # Copy BuilderOS core files to the new project for local brain
    cp "$BASE_DIR/CLAUDE.md" "$DEST/"
    cp "$BASE_DIR/TOOL_REGISTRY.md" "$DEST/"
    cp "$BASE_DIR/SKILLS_REGISTRY.md" "$DEST/"
    
    echo "Project initialized successfully!"
    ;;
    
  blueprint)
    BLUEPRINT=${2:-}
    if [ -z "$BLUEPRINT" ] || [ ! -f "$BLUEPRINT" ]; then
        echo "Error: Blueprint file not found."
        exit 1
    fi
    echo "Applying blueprint '$BLUEPRINT'..."
    "$PY" "$BASE_DIR/core/blueprint_processor.py" "$BLUEPRINT"
    ;;
    
  deploy)
    echo "Starting deployment orchestration..."
    if [ -f "package.json" ] && grep -q "next" package.json; then
        echo "Detected Next.js project. Running Vercel deployment..."
        vercel --prod
    elif [ -f "docker-compose.yml" ]; then
        echo "Detected Docker project. Building and pushing containers..."
        docker compose build && docker compose push
    else
        echo "Error: No supported deployment target found."
    fi
    ;;

  secrets)
    shift
    echo "Managing secrets..."
    "$PY" "$BASE_DIR/core/utils/secrets.py" "$@"
    ;;

  shrink)
    echo "Shrinking project context for AI efficiency..."
    "$PY" "$BASE_DIR/core/utils/shrinker.py"
    ;;

  docs)
    echo "Generating project documentation..."
    "$PY" "$BASE_DIR/core/utils/auto_docs.py" "."
    ;;
    
  audit)
    echo "Auditing project..."
    if [ -f "scripts/audit.sh" ]; then
        bash scripts/audit.sh
    else
        echo "No audit script found. Creating one from template..."
        cp "$TEMPLATES_DIR/audit.sh" "scripts/audit.sh"
        bash scripts/audit.sh
    fi
    ;;

  eval)
    shift
    echo "Running BuilderOS quality evals..."
    "$PY" "$BASE_DIR/evals/run_evals.py" "$@"
    ;;

  log)
    shift
    "$PY" "$BASE_DIR/core/utils/session_log.py" "$@"
    ;;

  *)
    usage
    ;;
esac
