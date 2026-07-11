# Install BuilderOS into a project (one command)

Goal: drop BuilderOS into any project so Claude builds it **0 → 100 from one
sentence**, without you typing `gh2`.

## Install

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1 C:\path\to\your\project
```

**macOS / Linux / Git Bash:**
```bash
bash setup.sh /path/to/your/project
```

Run with no argument to install into the current folder.

## What it does

1. Copies BuilderOS into `your-project/builderos/`.
2. Creates (or appends to) `your-project/CLAUDE.md` — the file Claude Code reads
   automatically every session. This activates the **Autonomous Build Protocol**.

That's it. No global config, no PATH changes, no paid services.

## Use

Open Claude Code in your project and type one line:

```
build me a markdown note-taking CLI with add, list, and search
```

Claude will, in that one turn: lock the goal → scaffold → write real code → add
infra (.gitignore, .env.example, tests, README) → build it → run the tests →
execute and show it working.

## Notes

- `gh2` (in `builderos/core/`) is an **optional** accelerator. You never have to
  type it; Claude builds directly with its own tools.
- For the smartest free architect, install [Ollama](https://ollama.com) once and
  run `ollama pull llama3`. Without it, an offline scaffold still works.
- Updating: re-run the installer; it overwrites `builderos/` and leaves your root
  `CLAUDE.md` intact if already wired.
