"""Merge BuilderOS hooks into a project's .claude/settings.json.

Idempotent and non-destructive: preserves any existing settings/hooks and only
adds the BuilderOS hook entries if they are not already present.

    python builderos/scripts/install_hooks.py <target-project-dir>
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(os.path.dirname(HERE), "templates", "project-settings.json")
MARKER = "builderos/scripts/hook.py"


def _has_marker(entries):
    for group in entries:
        for h in group.get("hooks", []):
            if MARKER in h.get("command", ""):
                return True
    return False


def main():
    if len(sys.argv) < 2:
        print("usage: install_hooks.py <target-project-dir>")
        return 1
    target = sys.argv[1]
    claude_dir = os.path.join(target, ".claude")
    settings_path = os.path.join(claude_dir, "settings.json")
    os.makedirs(claude_dir, exist_ok=True)

    with open(TEMPLATE, encoding="utf-8") as f:
        template = json.load(f)

    if os.path.exists(settings_path):
        try:
            with open(settings_path, encoding="utf-8") as f:
                settings = json.load(f)
        except (json.JSONDecodeError, OSError):
            print(f"warning: could not parse {settings_path}; leaving it untouched.")
            return 0
    else:
        settings = {}

    hooks = settings.setdefault("hooks", {})
    added = []
    for event, groups in template["hooks"].items():
        existing = hooks.setdefault(event, [])
        if not _has_marker(existing):
            existing.extend(groups)
            added.append(event)

    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")

    if added:
        print(f"BuilderOS hooks added to {settings_path}: {', '.join(added)}")
    else:
        print(f"BuilderOS hooks already present in {settings_path}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
