import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.safe_paths import safe_join, UnsafePathError


def load_blueprint(blueprint_path):
    with open(blueprint_path, "r", encoding="utf-8") as f:
        return json.load(f)


def apply_blueprint(blueprint, root=".", dry_run=False, overwrite=False):
    """Scaffold directories and files described by a blueprint dict.

    All paths are confined to `root` via safe_join. Existing files are skipped
    unless `overwrite=True`. `dry_run=True` prints actions without writing.
    """
    root = os.path.abspath(root)
    project_name = blueprint.get("name", "new-project")
    created, skipped = 0, 0
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}Scaffolding project: {project_name} (root: {root})")

    for directory in blueprint.get("directories", []):
        try:
            target = safe_join(root, directory)
        except UnsafePathError as e:
            print(f"  [BLOCKED] directory {e}")
            continue
        print(f"  {tag}dir  {os.path.relpath(target, root)}/")
        if not dry_run:
            os.makedirs(target, exist_ok=True)

    for file_info in blueprint.get("files", []):
        rel = file_info.get("path")
        content = file_info.get("content", "")
        try:
            target = safe_join(root, rel)
        except UnsafePathError as e:
            print(f"  [BLOCKED] file {e}")
            continue

        if os.path.exists(target) and not overwrite:
            print(f"  {tag}skip {os.path.relpath(target, root)} (exists)")
            skipped += 1
            continue

        print(f"  {tag}file {os.path.relpath(target, root)}")
        if not dry_run:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                f.write(content)
        created += 1

    print(f"{tag}Done: {created} file(s) written, {skipped} skipped.")
    return created, skipped


def main(argv=None):
    parser = argparse.ArgumentParser(description="Apply a BuilderOS blueprint.")
    parser.add_argument("blueprint", help="Path to blueprint JSON file")
    parser.add_argument("--root", default=".", help="Project root to scaffold into")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.blueprint):
        print(f"Error: blueprint not found: {args.blueprint}")
        return 1
    try:
        blueprint = load_blueprint(args.blueprint)
    except json.JSONDecodeError as e:
        print(f"Error: invalid blueprint JSON: {e}")
        return 1

    apply_blueprint(blueprint, root=args.root, dry_run=args.dry_run, overwrite=args.overwrite)
    return 0


if __name__ == "__main__":
    sys.exit(main())
