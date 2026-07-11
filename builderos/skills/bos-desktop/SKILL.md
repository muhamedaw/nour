---
name: bos-desktop
description: Desktop app patterns with Tauri (preferred) or Electron — window management, IPC, filesystem access, packaging, auto-update. Use when building any desktop, Windows, macOS, or Linux app.
---

# Desktop (Tauri first)
- Tauri: web frontend + Rust backend; far smaller than Electron. Electron only if a Node-native dependency is unavoidable.
- IPC: define typed commands (#[tauri::command]); validate every payload — the webview is untrusted.
- Filesystem: use the scoped FS API with an allowlist; never arbitrary-path access from the frontend.
- Persist window size/position; restore on launch. System tray only if the app is long-running.
- Keyboard shortcuts for every core action; native menus follow per-OS conventions.
- Packaging: tauri bundler per OS; sign builds; auto-update via tauri-updater with a static JSON endpoint.
- Keep heavy work in Rust/async; never block the UI thread.
