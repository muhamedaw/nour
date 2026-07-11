"""Scan builderos/skills/*/SKILL.md and write skills/index.json.

The index maps each skill name -> its description text. The matcher scores this
index against a project idea, so ANY bundled skill (bos-* or vendored ruflo) is
discoverable by its own description with no per-skill registry entry.

Re-run whenever skills are added:  python builderos/scripts/build_skill_index.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR = os.path.join(os.path.dirname(HERE), "skills")
OUT = os.path.join(SKILLS_DIR, "index.json")


def read_frontmatter(path):
    """Return (name, description) from the first YAML frontmatter block."""
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            text = f.read()
    except OSError:
        return None, None
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.S)
    block = m.group(1) if m else text[:600]
    lines = block.splitlines()
    name = desc = None
    for i, line in enumerate(lines):
        if name is None:
            nm = re.match(r"\s*name\s*:\s*(.+)", line)
            if nm:
                name = nm.group(1).strip().strip('"\'')
        if desc is None:
            dm = re.match(r"\s*description\s*:\s*(.*)", line)
            if dm:
                val = dm.group(1).strip().strip('"\'')
                if val in (">", "|", ">-", "|-", ""):
                    # YAML block scalar: gather following indented lines.
                    collected = []
                    for nxt in lines[i + 1:]:
                        if nxt.strip() == "" or nxt[:1] in (" ", "\t"):
                            collected.append(nxt.strip())
                        else:
                            break
                    desc = " ".join(c for c in collected if c)
                else:
                    desc = val
    return name, desc


def main():
    index = {}
    for entry in sorted(os.listdir(SKILLS_DIR)):
        skill_dir = os.path.join(SKILLS_DIR, entry)
        skill_md = os.path.join(skill_dir, "SKILL.md")
        if not os.path.isfile(skill_md):
            continue
        name, desc = read_frontmatter(skill_md)
        index[entry] = {"name": name or entry, "description": desc or ""}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
    print(f"Indexed {len(index)} skills -> {OUT}")


if __name__ == "__main__":
    main()
