#!/usr/bin/env python3
"""
scripts/_apply_deeplinks.py — Claude-owned.

Idempotently patches android/app/src/main/AndroidManifest.xml to
register the two URL-scheme intent-filters used by the Capacitor APK:

  1. coffee-shop-floor://           <data android:scheme="coffee-shop-floor" />
  2. coffee-shop-floor://m-manager/ <data android:scheme="coffee-shop-floor" android:host="m-manager" />

Used by:
  - scripts/wire-deeplinks.sh   (Linux / macOS / Git-Bash)
  - scripts/wire-deeplinks.ps1  (Windows PowerShell)

CRLF-safe (Android XML ships with CRLF on Windows generators), UTF-8
safe, re-runnable without double-inserting.
"""
from __future__ import annotations

import io
import re
import sys


def _eprint(*args, **kwargs) -> None:
    print(*args, file=sys.stderr, **kwargs)


_LAUNCHER_PAT = re.compile(
    r"(<activity[^>]*MainActivity[^>]*>)"
    r"(\s*<intent-filter>\s*<action android:name=\"android\.intent\.action\.MAIN\"\s*/>"
    r"\s*<category android:name=\"android\.intent\.category\.LAUNCHER\"\s*/>"
    r"\s*</intent-filter>)",
    re.DOTALL,
)

_FILTER_OP = """
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="coffee-shop-floor" />
        </intent-filter>"""

_FILTER_MGR = """
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="coffee-shop-floor" android:host="m-manager" />
        </intent-filter>"""


def patch(manifest_path: str) -> int:
    with io.open(manifest_path, "r", encoding="utf-8") as f:
        src = f.read()

    m = _LAUNCHER_PAT.search(src)
    if not m:
        _eprint("[wire-deeplinks] could not find MainActivity LAUNCHER block — abort")
        return 1
    launcher_block = m.group(2)

    out = src
    if 'android:scheme="coffee-shop-floor"' in out:
        print("[wire-deeplinks] operational scheme already wired — skipping first filter")
    else:
        out = out.replace(launcher_block, launcher_block + _FILTER_OP, 1)
        print("[wire-deeplinks] inserted operational scheme intent-filter")

    if 'android:host="m-manager"' in out:
        print("[wire-deeplinks] manager scheme already wired — skipping second filter")
    else:
        m2 = _LAUNCHER_PAT.search(out)
        if not m2:
            _eprint("[wire-deeplinks] lost launcher block after first insert — abort")
            return 1
        out = out.replace(m2.group(2), m2.group(2) + _FILTER_MGR, 1)
        print("[wire-deeplinks] inserted manager scheme intent-filter")

    with io.open(manifest_path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"[wire-deeplinks] wrote two deep-link intent-filters into {manifest_path}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        _eprint("usage: _apply_deeplinks.py <path-to-AndroidManifest.xml>")
        return 2
    return patch(argv[1])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
