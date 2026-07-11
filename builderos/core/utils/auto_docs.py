import os
import re
import sys

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".next", "dist", "build", "docs", ".venv"}


def build_tree(project_path):
    lines = ["## Project Structure\n", "```"]
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, project_path)
        level = 0 if rel == "." else rel.count(os.sep) + 1
        indent = "  " * level
        lines.append(f"{indent}- {os.path.basename(os.path.abspath(root))}/")
        for f in sorted(files):
            lines.append(f"{indent}  - {f}")
    lines.append("```\n")
    return lines


def extract_routes(project_path):
    """Best-effort scan for FastAPI / Express style routes."""
    routes = []
    py_dec = re.compile(r"@\w+\.(get|post|put|patch|delete)\(\s*[\"']([^\"']+)[\"']", re.I)
    js_dec = re.compile(r"\.(get|post|put|patch|delete)\(\s*[\"']([^\"']+)[\"']", re.I)
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if not f.endswith((".py", ".ts", ".js")):
                continue
            path = os.path.join(root, f)
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    text = fh.read()
            except OSError:
                continue
            matcher = py_dec if f.endswith(".py") else js_dec
            for method, route in matcher.findall(text):
                routes.append((method.upper(), route, os.path.relpath(path, project_path)))
    return routes


def generate_docs(project_path, output_file="PROJECT_DOCS.md"):
    content = ["# Project Documentation\n"]
    content += build_tree(project_path)

    content.append("## API Endpoints\n")
    routes = extract_routes(project_path)
    if routes:
        content.append("| Method | Route | Source |")
        content.append("|--------|-------|--------|")
        for method, route, src in routes:
            content.append(f"| {method} | `{route}` | {src} |")
        content.append("")
    else:
        content.append("_No HTTP routes detected._\n")

    content.append("## Usage\n")
    content.append("```bash")
    content.append("# Scaffold a project from a template")
    content.append("gh2 init web-nextjs my-app")
    content.append("# Regenerate this file")
    content.append("gh2 docs")
    content.append("```\n")

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(content))
    print(f"Documentation generated to {output_file} ({len(routes)} routes found)")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    generate_docs(target)
