# Builder OS — Tool Registry

> Auto-updated by Claude Code after each session via Stop hook.
> Last sync: 2026-05-30

---

## How This Works

When Claude Code detects a missing tool or creates a new one during a session, it appends a row to this table. The sync hook then commits and pushes this file to GitHub automatically.

---

## Registered Tools

| Tool | Purpose | Location | Command |
|------|---------|----------|---------|
| sync-github.ps1 | Auto-commit and push registry changes to GitHub | BuilderOS/scripts/ | `pwsh -File sync-github.ps1` |
| caveman | Claude Code skill — cuts 65% output tokens by compressing prose to caveman-style; hooks auto-activate each session | ~/.claude/hooks/ | `/caveman` in Claude Code or say "caveman mode" |
| caveman-compress | Compresses CLAUDE.md / memory files to caveman style, cuts ~46% input tokens | via caveman | `/caveman-compress <file>` |
| token-optimizer | MCP server — returns smallest useful code excerpts to avoid reading full files | ~/.claude/ (MCP) | Already configured as MCP server |
| vercel-cli | Deploy static sites to Vercel from terminal | global npm | `vercel --prod` |
| audit.ps1 | Scan any project for missing tools | BuilderOS/scripts/ | `pwsh -File audit.ps1 <project-path>` |
| new-project.ps1 | Initialize a new project with Builder OS templates | BuilderOS/scripts/ | `pwsh -File new-project.ps1 <project-path>` |
| launch.bat | Desktop launcher — start any project with Builder OS | BuilderOS/ | Double-click or `launch.bat <path>` |
| gh2 | BuilderOS command-line interface (dispatcher for all commands below) | BuilderOS/core/gh2.sh | `gh2 <command>` |
| gh2 architect | Generate + validate a blueprint from natural language (free Ollama default, optional ANTHROPIC_API_KEY, offline fallback) | BuilderOS/core/architect/ai_planner.py | `gh2 architect [--build] "<description>"` |
| safe_paths | Path-traversal guard reused by all file-writing tools | BuilderOS/core/utils/safe_paths.py | imported via `safe_join(root, rel)` |
| test suite | Pytest coverage for path guard, secrets, routes, blueprint validation | BuilderOS/tests/test_core.py | `pytest -q` |
| gh2 eval | Scores architect output quality; regression gate (offline, free) | BuilderOS/evals/run_evals.py | `gh2 eval` |
| gh2 log | Append-only architectural decision log | BuilderOS/core/utils/session_log.py | `gh2 log "<decision>"` |
| gh2 init | Scaffold a new project from a template | BuilderOS/core/gh2.sh | `gh2 init <template> <path>` |
| gh2 blueprint | Apply a blueprint JSON to the current project | BuilderOS/core/blueprint_processor.py | `gh2 blueprint <file>` |
| gh2 deploy | Orchestrate deployment to Vercel or Docker | BuilderOS/core/gh2.sh | `gh2 deploy` |
| gh2 secrets | Generate secure secret keys and init env files | BuilderOS/core/utils/secrets.py | `gh2 secrets [.env] [VARS...]` |
| gh2 shrink | Compress project context for efficient AI processing | BuilderOS/core/utils/shrinker.py | `gh2 shrink` |
| gh2 docs | Generate PROJECT_DOCS.md (structure + routes) | BuilderOS/core/utils/auto_docs.py | `gh2 docs` |
| gh2 audit | Audit current project for missing tools | BuilderOS/templates/audit.sh | `gh2 audit` |

---

## Tool Categories Reference

When adding tools, use these category labels:

- `code-quality` — linters, formatters, type checkers
- `debugging` — loggers, error trackers, profilers
- `testing` — unit, integration, e2e frameworks
- `security` — secret scanners, dep auditors, validators
- `automation` — build, deploy, health-check scripts
- `ux-ui` — component systems, design tokens, animations
- `ai` — model integrations, prompt utilities, AI agents
- `devops` — Docker, CI/CD, monitoring

---

## Missing Tools Log

> Tools detected as missing in projects but not yet globally available:

| Project | Missing Tool | Date Detected | Status |
|---------|-------------|--------------|--------|
| — | — | — | — |
