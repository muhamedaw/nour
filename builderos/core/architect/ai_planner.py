"""BuilderOS Architect — turns a natural-language description into a validated
blueprint.json.

Free-first by design: the default backend is a LOCAL Ollama model (no account,
no cost). If `ANTHROPIC_API_KEY` is set, the Anthropic backend is used instead.
Both backends use only the Python standard library (urllib) — zero pip installs.

If no backend is reachable, it falls back to a deterministic offline scaffold so
the command never hard-fails.

Usage:
    python ai_planner.py "<description>" [--provider auto|ollama|anthropic|offline]
                                         [--model NAME] [--out blueprint.json]
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.safe_paths import is_safe  # noqa: E402

SYSTEM_PROMPT = (
    "You are the BuilderOS Architect. Given a short project description, output "
    "ONLY a JSON object (no prose, no markdown fences) with this exact shape:\n"
    '{\n'
    '  "name": "<kebab-case project name>",\n'
    '  "stack": ["<tech>", "..."],\n'
    '  "directories": ["src", "tests"],\n'
    '  "files": [{"path": "src/main.py", "content": "..."}]\n'
    "}\n"
    "Rules: paths are RELATIVE (never start with / or .. or a drive letter). "
    "Keep it minimal but runnable. Content must be real code, not placeholders."
)

REQUIRED_KEYS = ("name", "stack", "directories", "files")


# --------------------------------------------------------------------------- #
# Backends (stdlib only)
# --------------------------------------------------------------------------- #
def _http_post(url, payload, headers, timeout=120):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def call_ollama(description, model="llama3", host=None):
    host = host or os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    body = {
        "model": model,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": description},
        ],
    }
    out = _http_post(f"{host}/api/chat", body, {"Content-Type": "application/json"})
    return out["message"]["content"]


def call_anthropic(description, model="claude-opus-4-8"):
    key = os.environ["ANTHROPIC_API_KEY"]
    body = {
        "model": model,
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": description}],
    }
    headers = {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
    }
    out = _http_post("https://api.anthropic.com/v1/messages", body, headers)
    return "".join(block.get("text", "") for block in out.get("content", []))


def offline_scaffold(description):
    """Deterministic blueprint when no model backend is available."""
    name = "-".join(description.lower().split()[:4]) or "new-project"
    name = "".join(c for c in name if c.isalnum() or c == "-").strip("-") or "new-project"
    return {
        "name": name,
        "stack": ["python"],
        "directories": ["src", "tests"],
        "files": [
            {
                "path": "src/main.py",
                "content": f'"""{description}"""\n\n\ndef main():\n    print("TODO: {name}")\n\n\nif __name__ == "__main__":\n    main()\n',
            },
            {
                "path": "README.md",
                "content": f"# {name}\n\n{description}\n\n_Scaffolded offline by BuilderOS Architect._\n",
            },
        ],
    }


# --------------------------------------------------------------------------- #
# Parsing + validation
# --------------------------------------------------------------------------- #
def parse_blueprint(raw):
    """Extract and parse a JSON object from raw model text."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        raw = raw[4:] if raw.lower().startswith("json") else raw
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object found in model output")
    return json.loads(raw[start : end + 1])


def validate_blueprint(bp):
    """Raise ValueError if the blueprint is malformed or contains unsafe paths."""
    if not isinstance(bp, dict):
        raise ValueError("blueprint must be a JSON object")
    for key in REQUIRED_KEYS:
        if key not in bp:
            raise ValueError(f"blueprint missing required key: {key}")
    if not isinstance(bp["files"], list) or not bp["files"]:
        raise ValueError("blueprint 'files' must be a non-empty list")
    for d in bp.get("directories", []):
        if not is_safe(".", d):
            raise ValueError(f"unsafe directory path in blueprint: {d!r}")
    for f in bp["files"]:
        path = f.get("path")
        if not path or not is_safe(".", path):
            raise ValueError(f"unsafe or missing file path in blueprint: {path!r}")
    return bp


def generate_blueprint(description, provider="auto", model=None):
    """Return (blueprint_dict, provider_used)."""
    if provider == "auto":
        order = (["anthropic"] if os.environ.get("ANTHROPIC_API_KEY") else []) + ["ollama", "offline"]
    else:
        order = [provider]

    last_err = None
    for prov in order:
        try:
            if prov == "offline":
                return validate_blueprint(offline_scaffold(description)), "offline"
            if prov == "anthropic":
                raw = call_anthropic(description, model or "claude-opus-4-8")
            elif prov == "ollama":
                raw = call_ollama(description, model or os.environ.get("OLLAMA_MODEL", "llama3"))
            else:
                raise ValueError(f"unknown provider: {prov}")
            return validate_blueprint(parse_blueprint(raw)), prov
        except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
            last_err = f"{prov}: {e}"
            print(f"  [architect] {prov} unavailable -> {e}", file=sys.stderr)
            continue
    raise RuntimeError(f"all providers failed. last: {last_err}")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate a BuilderOS blueprint.")
    parser.add_argument("description", help="Natural-language project description")
    parser.add_argument("--provider", default="auto",
                        choices=["auto", "ollama", "anthropic", "offline"])
    parser.add_argument("--model", default=None, help="Override model name")
    parser.add_argument("--out", default="blueprint.json", help="Output file")
    args = parser.parse_args(argv)

    blueprint, used = generate_blueprint(args.description, args.provider, args.model)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(blueprint, f, indent=2)
    print(f"Blueprint written to {args.out} (provider: {used}, "
          f"{len(blueprint['files'])} files)")
    print(f"Next: gh2 blueprint {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
