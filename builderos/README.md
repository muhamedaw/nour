# Builder OS v1

A self-improving development environment that turns Claude Code into a senior engineering system.

## What This Does

Every time you open Claude Code in any project, it automatically:
1. Scans the full repository
2. Audits missing tools and infrastructure
3. Creates anything that's missing
4. Follows a production-grade development process

After each session, it auto-syncs the tool and skills registry to this GitHub repo.

## Setup

### 1. Clone This Repo to Your Desktop

```
git clone https://github.com/YOUR_USERNAME/builder-os C:\Users\YOUR_NAME\Desktop\BuilderOS
```

### 2. Set Up GitHub Auto-Sync

```powershell
cd C:\Users\Muhammed\Desktop\BuilderOS
git remote add origin https://github.com/YOUR_USERNAME/builder-os.git
git push -u origin main
```

### 3. Start Any Project

**Option A — Double-click `launch.bat` on the Desktop**
- Choose option 1 (existing project) or 2 (new project)
- Claude Code opens with Builder OS active

**Option B — Open Claude Code directly**
- Builder OS is already active globally via `~/.claude/CLAUDE.md`
- No launcher needed

## How the Auto-Sync Works

```
Claude detects missing tool
        ↓
Claude updates TOOL_REGISTRY.md locally
        ↓
Session ends → Stop hook fires
        ↓
sync-github.ps1 runs
        ↓
git commit + push to GitHub
```

## File Structure

```
BuilderOS/
├── CLAUDE.md              ← Main system brain (also at ~/.claude/CLAUDE.md)
├── TOOL_REGISTRY.md       ← Auto-updated tool registry
├── SKILLS_REGISTRY.md     ← Auto-updated skills registry
├── launch.bat             ← Desktop launcher
├── scripts/
│   ├── sync-github.ps1    ← Auto-sync hook
│   ├── audit.ps1          ← Project health audit
│   └── new-project.ps1    ← New project initializer
└── templates/
    ├── audit.sh
    ├── build.sh
    ├── dev.sh
    ├── test.sh
    └── clean.sh
```

## Scripts

| Script | Usage |
|--------|-------|
| `launch.bat` | Desktop launcher — start any project |
| `scripts/audit.ps1 <path>` | Audit a project for missing tools |
| `scripts/new-project.ps1 <path>` | Init a new project with templates |
| `scripts/sync-github.ps1` | Manually sync registry to GitHub |

## Upgrading

To upgrade to a new version: pull from GitHub. TOOL_REGISTRY.md and SKILLS_REGISTRY.md are auto-updated — never edit them manually.
