"""BuilderOS core test suite. Run: pytest -q  (from the BuilderOS root)."""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, os.path.join(ROOT, "core", "utils"))
sys.path.insert(0, os.path.join(ROOT, "core", "architect"))

import safe_paths  # noqa: E402
import secrets as bos_secrets  # noqa: E402  (the BuilderOS secrets util, not stdlib)
import auto_docs  # noqa: E402
import blueprint_processor as bp  # noqa: E402
import ai_planner  # noqa: E402


# --------------------------- safe_paths --------------------------- #
@pytest.mark.parametrize("bad", [
    "../escape.txt",
    "../../etc/passwd",
    "/abs/path",
    "C:/Windows/system32",
    "sub/../../escape",
    "",
])
def test_safe_join_rejects_traversal(tmp_path, bad):
    with pytest.raises(safe_paths.UnsafePathError):
        safe_paths.safe_join(str(tmp_path), bad)


@pytest.mark.parametrize("good", ["src/main.py", "a/b/c.txt", "file.md"])
def test_safe_join_allows_inside(tmp_path, good):
    result = safe_paths.safe_join(str(tmp_path), good)
    assert result.startswith(os.path.abspath(str(tmp_path)))


# --------------------------- secrets --------------------------- #
def test_secret_key_entropy_and_charset():
    a, b = bos_secrets.generate_secret_key(), bos_secrets.generate_secret_key()
    assert a != b
    assert len(a) >= 32
    for ch in ("=", "#", '"', "'", " "):
        assert ch not in a  # must be safe for .env


def test_init_env_file_skips_existing(tmp_path):
    p = tmp_path / ".env"
    p.write_text("EXISTING=1")
    bos_secrets.init_env_file(str(p), ["API_SECRET_KEY"])
    assert p.read_text() == "EXISTING=1"  # untouched


def test_init_env_file_generates_secrets(tmp_path):
    p = tmp_path / ".env"
    bos_secrets.init_env_file(str(p), ["DATABASE_URL", "API_SECRET_KEY"])
    lines = dict(l.split("=", 1) for l in p.read_text().splitlines())
    assert lines["DATABASE_URL"] == ""
    assert len(lines["API_SECRET_KEY"]) >= 32


# --------------------------- auto_docs --------------------------- #
def test_route_extraction(tmp_path):
    api = tmp_path / "app"
    api.mkdir()
    (api / "main.py").write_text("@app.get('/items')\ndef f(): pass\n")
    routes = auto_docs.extract_routes(str(tmp_path))
    assert ("GET", "/items", os.path.join("app", "main.py")) in routes


# --------------------------- blueprint_processor --------------------------- #
def test_blueprint_blocks_traversal(tmp_path, capsys):
    blueprint = {
        "name": "x",
        "directories": [],
        "files": [{"path": "../evil.txt", "content": "pwned"}],
    }
    bp.apply_blueprint(blueprint, root=str(tmp_path))
    assert not (tmp_path.parent / "evil.txt").exists()
    assert "BLOCKED" in capsys.readouterr().out


def test_blueprint_creates_files_and_skips_existing(tmp_path):
    blueprint = {
        "name": "demo",
        "directories": ["src"],
        "files": [{"path": "src/main.py", "content": "print('hi')"}],
    }
    created, skipped = bp.apply_blueprint(blueprint, root=str(tmp_path))
    assert created == 1 and skipped == 0
    assert (tmp_path / "src" / "main.py").read_text() == "print('hi')"
    # second run skips
    created2, skipped2 = bp.apply_blueprint(blueprint, root=str(tmp_path))
    assert created2 == 0 and skipped2 == 1


def test_blueprint_dry_run_writes_nothing(tmp_path):
    blueprint = {"name": "d", "directories": [], "files": [{"path": "a.txt", "content": "x"}]}
    bp.apply_blueprint(blueprint, root=str(tmp_path), dry_run=True)
    assert not (tmp_path / "a.txt").exists()


# --------------------------- ai_planner --------------------------- #
def test_offline_provider_produces_valid_blueprint():
    blueprint, used = ai_planner.generate_blueprint("a todo cli app", provider="offline")
    assert used == "offline"
    ai_planner.validate_blueprint(blueprint)  # raises if invalid
    assert blueprint["files"]


def test_validate_rejects_unsafe_paths():
    bad = {"name": "x", "stack": [], "directories": [], "files": [{"path": "../x", "content": ""}]}
    with pytest.raises(ValueError):
        ai_planner.validate_blueprint(bad)


def test_parse_blueprint_strips_fences():
    raw = "```json\n{\"name\": \"x\", \"stack\": [], \"directories\": [], \"files\": [{\"path\": \"a\", \"content\": \"\"}]}\n```"
    parsed = ai_planner.parse_blueprint(raw)
    assert parsed["name"] == "x"
