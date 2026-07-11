"""Auto-install BuilderOS skills that match a project idea.

The user never uploads skills. BuilderOS ships them in builderos/skills/ (its own
bos-* skills plus a large vendored library). This matcher copies only the skills
relevant to the idea into the project's .claude/skills/, so per-session context
stays small even though the bundle is large.

Matching:
  - `always` skills from registry.json are installed every time.
  - Every other bundled skill is scored by keyword overlap between the idea and
    the skill's own dir-name + name + description (from skills/index.json).
    The top matches above a threshold are installed, capped at --max.

    python builderos/scripts/install_skills.py --idea "a react auth dashboard"
    python builderos/scripts/install_skills.py --always
"""
import argparse
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR = os.path.join(os.path.dirname(HERE), "skills")
REGISTRY = os.path.join(SKILLS_DIR, "registry.json")
INDEX = os.path.join(SKILLS_DIR, "index.json")

STOP = {
    "a", "an", "the", "and", "or", "for", "with", "to", "of", "in", "on", "me",
    "my", "build", "make", "create", "want", "need", "app", "application", "using",
    "that", "this", "it", "is", "are", "some", "please", "add", "new", "project",
}


def _tokens(text):
    # rstrip("s") = crude singularization so "emails" matches "email".
    return {w.rstrip("s") or w for w in re.split(r"[^a-z0-9]+", (text or "").lower())
            if len(w) > 2 and w not in STOP}


def _load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def select_skills(idea, always_only=False, max_skills=6, min_score=2):
    """Return ordered skill names: always-skills first, then top idea matches."""
    reg = _load_json(REGISTRY, {})
    selected, seen = [], set()

    def add(name):
        if name not in seen and os.path.isdir(os.path.join(SKILLS_DIR, name)):
            seen.add(name)
            selected.append(name)

    for s in reg.get("always", []):
        add(s)

    if always_only or not idea:
        return selected

    idea_tokens = _tokens(idea)

    # Explicit keyword overrides from registry (strong, human-curated).
    low = idea.lower()
    for patterns, skills in reg.get("match", {}).items():
        # Word-boundary match so "orm" can't fire inside "platformer";
        # optional plural "s" so "payments" still matches "payment".
        if any(kw and re.search(r"(?<![a-z0-9])" + re.escape(kw.strip()) + r"s?(?![a-z0-9])", low)
               for kw in patterns.split("|")):
            for s in skills:
                add(s)

    # Description/name scoring over the whole bundle.
    index = _load_json(INDEX, {})
    scored = []
    for skill, meta in index.items():
        if skill in seen:
            continue
        haystack = skill.replace("-", " ") + " " + meta.get("name", "") + " " + meta.get("description", "")
        score = len(idea_tokens & _tokens(haystack))
        if score >= min_score:
            scored.append((score, skill))
    scored.sort(key=lambda x: (-x[0], x[1]))

    room = max(0, max_skills - len(selected))
    for _, skill in scored[:room]:
        add(skill)

    return selected


def install(skill_names, project_dir):
    """Copy each skill into <project>/.claude/skills/<name> if not already there."""
    dest_root = os.path.join(project_dir, ".claude", "skills")
    os.makedirs(dest_root, exist_ok=True)
    activated = []
    for name in skill_names:
        src = os.path.join(SKILLS_DIR, name)
        dst = os.path.join(dest_root, name)
        if os.path.isdir(dst):
            continue
        try:
            shutil.copytree(src, dst)
            activated.append(name)
        except OSError:
            continue
    return activated


def main(argv=None):
    parser = argparse.ArgumentParser(description="Auto-install matching BuilderOS skills.")
    parser.add_argument("--idea", default="", help="Project idea / prompt text")
    parser.add_argument("--always", action="store_true", help="Install base skills only")
    parser.add_argument("--project", default=".", help="Project root")
    parser.add_argument("--max", type=int, default=6, help="Max skills to install")
    args = parser.parse_args(argv)

    selected = select_skills(args.idea, always_only=args.always, max_skills=args.max)
    install(selected, args.project)
    if selected:
        print(",".join(selected))
    return 0


if __name__ == "__main__":
    sys.exit(main())
