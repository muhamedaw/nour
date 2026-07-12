"""BuilderOS skill finder — the tool Claude calls DURING PLANNING to decide,
per feature, which skills a task needs and whether they are already local or must
be fetched from the internet. Token-cheap: returns only the verdict, never the
whole catalog.

    python skill_find.py "stripe subscription billing"
    python skill_find.py "stripe billing" --install   # also copy local matches into .claude/skills/

Output (human + machine readable):
    LOCAL: bos-payments (12), payments (7)      <- score in parens
    FETCH: no local skill above threshold -> the prompt hook will pull the top
           GitHub match automatically, OR run skill_hunter.py to fetch now.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR = os.path.join(os.path.dirname(HERE), "skills")
INDEX = os.path.join(SKILLS_DIR, "index.json")

STOP = {
    "a", "an", "the", "and", "or", "for", "with", "to", "of", "in", "on", "me",
    "my", "build", "make", "create", "want", "need", "app", "application",
    "using", "that", "this", "it", "is", "are", "please", "add", "new", "project",
    "now", "then", "how", "can", "feature", "want", "like",
}


def _tokens(text):
    return {w.rstrip("s") or w for w in re.split(r"[^a-z0-9]+", (text or "").lower())
            if len(w) > 2 and w not in STOP}


def find(query, top=8, min_score=2):
    try:
        with open(INDEX, encoding="utf-8") as f:
            index = json.load(f)
    except (OSError, json.JSONDecodeError):
        return []
    qt = _tokens(query)
    scored = []
    for skill, meta in index.items():
        hay = skill.replace("-", " ") + " " + meta.get("name", "") + " " + meta.get("description", "")
        score = len(qt & _tokens(hay))
        if score >= min_score:
            scored.append((score, skill, meta.get("description", "")[:70]))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return scored[:top]


def main(argv=None):
    p = argparse.ArgumentParser(description="Find skills for a task; decide local vs fetch.")
    p.add_argument("query", nargs="+", help="Feature / task description")
    p.add_argument("--install", action="store_true", help="Copy local matches into .claude/skills/")
    p.add_argument("--project", default=".")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    query = " ".join(args.query)
    matches = find(query)

    if args.json:
        print(json.dumps({
            "query": query,
            "local": [{"skill": s, "score": sc, "desc": d} for sc, s, d in matches],
            "source": "local" if matches else "fetch",
        }, indent=1))
        return 0

    if matches:
        print("LOCAL matches (already in library — invoke these, do not re-derive):")
        for sc, skill, desc in matches:
            print(f"  {skill:<28} ({sc})  {desc}")
        if args.install:
            sys.path.insert(0, HERE)
            import install_skills
            done = install_skills.install([s for _, s, _ in matches], args.project)
            print(f"\nInstalled into .claude/skills/: {', '.join(done) or '(already present)'}")
    else:
        print("FETCH: no local skill matches this task.")
        print("  The prompt hook auto-pulls the top-starred GitHub skill on your next")
        print("  message, or fetch now: python builderos/scripts/skill_hunter.py \""
              + query + "\"")
    return 0


if __name__ == "__main__":
    sys.exit(main())
