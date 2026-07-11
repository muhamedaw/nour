"""Append-only decision log for BuilderOS sessions.

The brain prompt promises a "live SESSION_LOG.md tracking architectural shifts".
This makes that real: every notable decision is appended with a UTC timestamp.
Append-only by design — history is never rewritten.

Usage:
    python session_log.py "switched auth to PBKDF2"      # append entry
    python session_log.py --show                          # print the log
"""
import datetime
import os
import sys

LOG_FILE = "SESSION_LOG.md"
HEADER = "# Session Log\n\n> Append-only record of architectural decisions. Newest at bottom.\n\n"


def append(message, path=LOG_FILE):
    new = not os.path.exists(path)
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(path, "a", encoding="utf-8") as f:
        if new:
            f.write(HEADER)
        f.write(f"- **{ts}** - {message}\n")
    print(f"Logged to {path}: {message}")


def show(path=LOG_FILE):
    if not os.path.exists(path):
        print(f"No {path} yet.")
        return
    with open(path, encoding="utf-8") as f:
        print(f.read(), end="")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "--show":
        show()
    else:
        append(" ".join(args))
