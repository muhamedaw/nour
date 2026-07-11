"""BuilderOS skill hunter — when the local 176-skill library has no match for an
idea, search GitHub for the highest-starred repo shipping matching skills and
vendor them into builderos/skills/ automatically.

Free: unauthenticated GitHub API (rate-limited but ample for occasional gaps).
Safe: size-capped tarball download, traversal-guarded extraction, results cached
so the same gap never triggers a second network hunt.

    python skill_hunter.py "<idea>"            # hunt + vendor, prints result
"""
import io
import json
import os
import re
import shutil
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILLS_DIR = os.path.join(ROOT, "skills")
CACHE_FILE = os.path.join(SKILLS_DIR, ".hunted.json")

MAX_REPO_KB = 51200          # skip repos larger than ~50MB
MAX_SKILLS_PER_REPO = 8      # vendor at most this many skill dirs from one repo
CACHE_TTL = 7 * 24 * 3600    # re-hunt a failed query after a week

STOP = {
    "a", "an", "the", "and", "or", "for", "with", "to", "of", "in", "on", "me",
    "my", "build", "make", "create", "want", "need", "app", "application",
    "using", "that", "this", "it", "is", "are", "please", "add", "new", "project",
    "now", "then", "how", "can", "you",
}


def _tokens(text):
    return [w for w in re.split(r"[^a-z0-9]+", (text or "").lower())
            if len(w) > 2 and w not in STOP]


def _cache_load():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _cache_save(cache):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=1)
    except OSError:
        pass


def _http_get(url, timeout=12):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "BuilderOS-skill-hunter",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def search_github(idea, per_page=5):
    """Top-starred repos likely to contain agent skills for this idea."""
    terms = " ".join(_tokens(idea)[:4])
    if not terms:
        return []
    q = urllib.parse.quote_plus(f"{terms} claude skill")
    url = (f"https://api.github.com/search/repositories?q={q}"
           f"&sort=stars&order=desc&per_page={per_page}")
    data = json.loads(_http_get(url).decode("utf-8"))
    return [
        {"full_name": r["full_name"], "stars": r["stargazers_count"],
         "size_kb": r.get("size", 0), "license": (r.get("license") or {}).get("spdx_id", "unknown"),
         "url": r["html_url"]}
        for r in data.get("items", [])
    ]


def _safe_members(tar):
    """Yield only members with safe relative paths (no traversal, no abs)."""
    for m in tar.getmembers():
        name = m.name.replace("\\", "/")
        if name.startswith("/") or ".." in name.split("/") or (len(name) > 1 and name[1] == ":"):
            continue
        if m.issym() or m.islnk():
            continue
        yield m


def vendor_repo_skills(full_name, idea_tokens):
    """Download repo tarball, extract dirs containing SKILL.md, copy the best
    matches into builderos/skills/. Returns list of vendored skill names."""
    raw = _http_get(f"https://codeload.github.com/{full_name}/tar.gz/HEAD", timeout=45)
    vendored = []
    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as tar:
            members = list(_safe_members(tar))
            try:
                tar.extractall(tmp, members=members, filter="data")
            except TypeError:  # Python < 3.12: no filter kwarg
                tar.extractall(tmp, members=members)

        # Find every directory that ships a SKILL.md.
        candidates = []
        for root, _dirs, files in os.walk(tmp):
            if "SKILL.md" in files or "skill.md" in files:
                name = os.path.basename(root).lower()
                name = re.sub(r"[^a-z0-9-]+", "-", name).strip("-") or "skill"
                name = re.sub(r"-head$", "", name)  # tarball root dirs end in -HEAD
                md = "SKILL.md" if "SKILL.md" in files else "skill.md"
                try:
                    with open(os.path.join(root, md), encoding="utf-8", errors="ignore") as f:
                        head = f.read(800).lower()
                except OSError:
                    head = ""
                score = sum(1 for t in idea_tokens if t in name or t in head)
                candidates.append((score, name, root))

        candidates.sort(key=lambda c: -c[0])
        for score, name, src in candidates[:MAX_SKILLS_PER_REPO]:
            dst = os.path.join(SKILLS_DIR, name)
            if os.path.isdir(dst):
                continue  # never overwrite an existing skill
            try:
                shutil.copytree(src, dst)
                # Normalize: ensure the file is named SKILL.md.
                low = os.path.join(dst, "skill.md")
                up = os.path.join(dst, "SKILL.md")
                if os.path.exists(low) and not os.path.exists(up):
                    os.rename(low, up)
                vendored.append(name)
            except OSError:
                continue
    return vendored


def _record_attribution(repo, vendored):
    path = os.path.join(SKILLS_DIR, "AUTO_VENDORED.md")
    new = not os.path.exists(path)
    with open(path, "a", encoding="utf-8") as f:
        if new:
            f.write("# Auto-vendored skills (fetched by skill hunter)\n\n"
                    "> Skills below were fetched automatically from GitHub because no local\n"
                    "> skill matched a prompt. Check each repo's license before redistributing.\n\n")
        ts = time.strftime("%Y-%m-%d")
        f.write(f"- **{ts}** {repo['full_name']} ({repo['stars']}★, license: {repo['license']}) "
                f"{repo['url']} -> {', '.join(vendored)}\n")


def hunt(idea):
    """Full pipeline. Returns dict {status, skills, repo} — never raises."""
    key = " ".join(sorted(_tokens(idea))[:6])
    if not key:
        return {"status": "empty-idea", "skills": []}

    cache = _cache_load()
    entry = cache.get(key)
    if entry:
        # Only trust cached skill names whose directories still exist.
        alive = [s for s in entry.get("skills", [])
                 if os.path.isdir(os.path.join(SKILLS_DIR, s))]
        if alive:
            return {"status": "cached", "skills": alive, "repo": entry.get("repo", "")}
        if not entry.get("skills") and time.time() - entry.get("ts", 0) < CACHE_TTL:
            return {"status": "cached-no-match", "skills": []}
        # Vendored skills were deleted or TTL expired -> fall through and re-hunt.

    result = {"status": "no-match", "skills": [], "repo": ""}
    try:
        idea_tokens = set(_tokens(idea))
        for repo in search_github(idea):
            if repo["size_kb"] > MAX_REPO_KB:
                continue
            vendored = vendor_repo_skills(repo["full_name"], idea_tokens)
            if vendored:
                _record_attribution(repo, vendored)
                # Refresh the searchable index so the matcher can score them.
                try:
                    sys.path.insert(0, HERE)
                    import build_skill_index
                    build_skill_index.main()
                except Exception:  # noqa: BLE001
                    pass
                result = {"status": "vendored",
                          "skills": vendored,
                          "repo": f"{repo['full_name']} ({repo['stars']}★)"}
                break
    except Exception as e:  # noqa: BLE001 — network/API failure must never crash a hook
        result = {"status": f"error: {e.__class__.__name__}", "skills": []}

    cache[key] = {"ts": time.time(), "skills": result["skills"], "repo": result.get("repo", "")}
    _cache_save(cache)
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: skill_hunter.py \"<idea>\"")
        sys.exit(1)
    out = hunt(" ".join(sys.argv[1:]))
    print(json.dumps(out, indent=1))
