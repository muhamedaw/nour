import os

def shrink_project_context(root_dir, output_file="CONTEXT_SUMMARY.md"):
    summary = ["# Project Context Summary\n", "## Directory Structure\n"]
    
    for root, dirs, files in os.walk(root_dir):
        if ".git" in root or "node_modules" in root or "__pycache__" in root:
            continue
        level = root.replace(root_dir, '').count(os.sep)
        indent = ' ' * 4 * (level)
        summary.append(f"{indent}- {os.path.basename(root)}/")
        sub_indent = ' ' * 4 * (level + 1)
        for f in files:
            summary.append(f"{sub_indent}- {f}")
            
    summary.append("\n## Key Files Content\n")
    key_files = ["package.json", "requirements.txt", "CLAUDE.md"]
    for kf in key_files:
        path = os.path.join(root_dir, kf)
        if os.path.exists(path):
            summary.append(f"### {kf}\n```")
            with open(path, 'r') as f:
                content = f.read()
                # Simple truncation logic
                summary.append(content[:500] + "..." if len(content) > 500 else content)
            summary.append("```\n")
            
    with open(output_file, 'w') as f:
        f.write('\n'.join(summary))
    print(f"Context shrunk and saved to {output_file}")

if __name__ == "__main__":
    shrink_project_context(".")
