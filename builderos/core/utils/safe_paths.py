"""Path-traversal guard shared by BuilderOS file-writing tools.

Any tool that writes files from external/untrusted data (blueprints, model
output) must route every path through `safe_join` so generated content cannot
escape the project root.
"""
import os


class UnsafePathError(ValueError):
    """Raised when a requested path would escape the project root."""


def safe_join(root, rel_path):
    """Join `rel_path` onto `root`, guaranteeing the result stays inside root.

    Rejects absolute paths, drive letters, and `..` traversal. Returns an
    absolute, normalized path safe to write to.
    """
    if rel_path is None or str(rel_path).strip() == "":
        raise UnsafePathError("empty path")

    rel_path = str(rel_path).replace("\\", "/")

    # Reject absolute (POSIX or Windows drive) paths outright.
    if os.path.isabs(rel_path) or (len(rel_path) >= 2 and rel_path[1] == ":"):
        raise UnsafePathError(f"absolute path not allowed: {rel_path!r}")

    root_abs = os.path.abspath(root)
    candidate = os.path.abspath(os.path.join(root_abs, rel_path))

    # candidate must be root itself or a descendant of root.
    if candidate != root_abs and not candidate.startswith(root_abs + os.sep):
        raise UnsafePathError(f"path escapes project root: {rel_path!r}")

    return candidate


def is_safe(root, rel_path):
    """Boolean convenience wrapper around `safe_join`."""
    try:
        safe_join(root, rel_path)
        return True
    except UnsafePathError:
        return False
