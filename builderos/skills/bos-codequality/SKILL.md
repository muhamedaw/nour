---
name: bos-codequality
description: BuilderOS code-quality guardrails to reduce bugs and overengineering. Use whenever writing, reviewing, or refactoring code.
---

# BuilderOS Code Quality

Goal: fewer bugs, smaller diffs, no wasted work.

## Before editing
- State the one behavior you are changing and the single success check for it.
- Read the surrounding code first; match its style, naming, and error-handling density.
- Name the exact files you will touch. If you can't, you don't understand the task yet.

## While editing
- Make the smallest change that satisfies the goal. No drive-by rewrites.
- One responsibility per function/file. Extract a shared util the *second* time you copy a line, not the first.
- Handle only real failure modes (network, disk, bad input). Do not guard impossible states.
- No placeholder bodies or `TODO` stubs in code you report as done.
- Surface assumptions explicitly instead of silently guessing; pick a sane default and say so.

## Before saying "done"
- It compiles / type-checks.
- A test covering the changed behavior exists and passes.
- You ran the success check and can state its actual output. Do not narrate around a failure — fix it.

## Smells to stop on
- A function that needs a paragraph to explain what it does → split it.
- The same literal in 3 places → name it once.
- A new dependency that saves 5 lines → prefer the stdlib.
- An abstraction with exactly one caller → inline it.
