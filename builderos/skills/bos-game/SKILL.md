---
name: bos-game
description: Game development patterns — game loop, canvas/WebGL rendering, input mapping, collision, state machines, Phaser/Godot basics. Use when building any game, arcade, puzzle, platformer, or interactive simulation.
---

# Games
- Web MVP: vanilla canvas or Phaser 3. Bigger scope: Godot. Ship desktop via Tauri, not an Electron wrapper.
- Core loop: fixed-timestep update (accumulator pattern), render interpolated; never tie physics to framerate.
- Structure: scenes (menu/play/gameover) as a state machine; entities as plain objects/components, not deep class trees.
- Input mapped through one layer (action names, not raw keys) — enables rebinding and touch later.
- Collision: AABB/circle checks first; spatial hash only when entity count demands it.
- Juice is the game feel: screen shake, hit-pause, particles, sound on every interaction — budget time for it.
- Save state = one serializable object in localStorage/file.
- Assets: placeholder art first (rects / kenney.nl CC0), swap late.
