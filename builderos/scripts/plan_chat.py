"""BuilderOS local Plan Chat — a free planning assistant on top of Ollama, with
correct Arabic rendering in the VS Code terminal.

Why this wrapper: the terminal shows raw logical-order Arabic (letters isolated
and lines reversed) because it does not apply the Unicode bidi algorithm. This
reshapes + reorders Arabic lines before printing, and forces UTF-8 I/O.

    python plan_chat.py [model]      # default: qwen2.5-coder:7b
"""
import json
import os
import sys
import urllib.request

# Force UTF-8 so Arabic bytes survive the Windows console.
for stream in (sys.stdout, sys.stdin, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    _AR = True
except Exception:  # noqa: BLE001 — degrade to raw output if libs missing
    _AR = False

HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
MODEL = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PLAN_MODEL", "qwen2.5:14b")
SYSTEM = (
    "You are the BuilderOS planning assistant. You turn a project idea into a "
    "complete, buildable plan (0 -> 100%). When the user writes in Arabic, reply "
    "in clear Modern Standard Arabic; keep code, commands, filenames, and tech "
    "names in English.\n\n"
    "For any project idea, produce a plan with these sections:\n"
    "1. الهدف (Goal): one sentence + the done-condition that proves it works.\n"
    "2. التقنيات (Stack): smallest stack that fits, with a one-line reason each.\n"
    "3. البنية (Structure): the directory + file tree.\n"
    "4. الخطوات (Build steps): ordered, each step = what to build and why.\n"
    "5. الاختبار (Tests): what to test and the command to run.\n"
    "6. المخاطر (Risks): the 2-3 things most likely to break, and the guard.\n\n"
    "Be concrete and concise. Prefer tables and short bullets over prose. If the "
    "idea is ambiguous, state your assumption and plan anyway — do not stall."
)


def _has_arabic(s):
    return any("؀" <= c <= "ۿ" or "ݐ" <= c <= "ݿ" for c in s)


def show(text):
    """Reshape+reorder any Arabic lines so the terminal renders them correctly."""
    for line in text.split("\n"):
        if _AR and _has_arabic(line):
            try:
                line = get_display(arabic_reshaper.reshape(line))
            except Exception:  # noqa: BLE001
                pass
        print(line)


def chat(messages):
    body = json.dumps({"model": MODEL, "messages": messages, "stream": False}).encode()
    req = urllib.request.Request(
        f"{HOST}/api/chat", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))["message"]["content"]


def main():
    print(f"BuilderOS Plan Chat — model: {MODEL} (local, free). Type 'exit' to quit.\n")
    history = [{"role": "system", "content": SYSTEM}]
    while True:
        try:
            user = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if user.lower() in ("exit", "quit", "/bye", "bye"):
            break
        if not user:
            continue
        history.append({"role": "user", "content": user})
        try:
            reply = chat(history)
        except Exception as e:  # noqa: BLE001
            print(f"[plan-chat] model error: {e}")
            history.pop()
            continue
        history.append({"role": "assistant", "content": reply})
        print()
        show(reply)
        print()


if __name__ == "__main__":
    main()
