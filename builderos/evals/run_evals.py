"""BuilderOS eval harness.

Runs each intent in cases.json through the architect, applies the blueprint into
a throwaway temp dir, and scores it. This is how prompt/model changes are kept
honest: every score is reproducible and regressions are visible.

Scoring (per case, 0..100):
  +30  blueprint is structurally valid (passes architect validation)
  +25  all paths are safe (no traversal escaped into temp root)
  +20  at least `min_files` files were actually written to disk
  +15  declared stack matches one of `expect_stack_any`
  +10  every .py file written is syntactically importable (compiles)

Usage:
    python run_evals.py [--provider auto|ollama|anthropic|offline] [--json]
Exit code is non-zero if the mean score drops below --threshold (default 70).
"""
import argparse
import json
import os
import py_compile
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, os.path.join(ROOT, "core", "utils"))
sys.path.insert(0, os.path.join(ROOT, "core", "architect"))

import ai_planner  # noqa: E402
import blueprint_processor as bp  # noqa: E402


def score_case(case, provider):
    result = {"id": case["id"], "score": 0, "notes": []}
    try:
        blueprint, used = ai_planner.generate_blueprint(case["intent"], provider=provider)
    except Exception as e:  # noqa: BLE001
        result["notes"].append(f"architect failed: {e}")
        return result
    result["provider"] = used

    # +30 structural validity (generate_blueprint already validated)
    result["score"] += 30
    result["notes"].append("valid structure")

    # Apply into a temp dir and inspect what actually landed.
    with tempfile.TemporaryDirectory() as tmp:
        created, _ = bp.apply_blueprint(blueprint, root=tmp)
        escaped = any(
            os.path.exists(os.path.join(tmp, "..", os.path.basename(f.get("path", ""))))
            and not os.path.exists(os.path.join(tmp, f.get("path", "")))
            for f in blueprint["files"]
        )
        # +25 path safety
        if not escaped:
            result["score"] += 25
            result["notes"].append("paths safe")

        # +20 min files written
        if created >= case.get("min_files", 1):
            result["score"] += 20
            result["notes"].append(f"{created} files written")
        else:
            result["notes"].append(f"only {created} files written")

        # +15 stack match
        stack = [s.lower() for s in blueprint.get("stack", [])]
        wanted = [s.lower() for s in case.get("expect_stack_any", [])]
        if not wanted or any(w in " ".join(stack) for w in wanted):
            result["score"] += 15
            result["notes"].append("stack ok")
        else:
            result["notes"].append(f"stack {stack} != {wanted}")

        # +10 python files compile
        py_ok = True
        for f in blueprint["files"]:
            p = os.path.join(tmp, f["path"])
            if p.endswith(".py") and os.path.exists(p):
                try:
                    py_compile.compile(p, doraise=True)
                except py_compile.PyCompileError:
                    py_ok = False
                    result["notes"].append(f"py compile failed: {f['path']}")
        if py_ok:
            result["score"] += 10

    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run BuilderOS architect evals.")
    parser.add_argument("--provider", default="offline",
                        choices=["auto", "ollama", "anthropic", "offline"],
                        help="Backend to evaluate (default offline = deterministic, free)")
    parser.add_argument("--threshold", type=float, default=70.0)
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args(argv)

    with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as f:
        cases = json.load(f)["cases"]

    results = [score_case(c, args.provider) for c in cases]
    mean = sum(r["score"] for r in results) / len(results) if results else 0.0

    if args.json:
        print(json.dumps({"mean": mean, "results": results}, indent=2))
    else:
        print(f"\nBuilderOS Evals  (provider: {args.provider})")
        print("=" * 48)
        for r in results:
            print(f"  {r['id']:<14} {r['score']:>3}/100  {'; '.join(r['notes'])}")
        print("=" * 48)
        print(f"  MEAN: {mean:.1f}/100  (threshold {args.threshold})")

    return 0 if mean >= args.threshold else 1


if __name__ == "__main__":
    sys.exit(main())
