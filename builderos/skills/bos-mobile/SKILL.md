---
name: bos-mobile
description: Mobile app patterns with React Native + Expo — navigation, offline storage, push notifications, release builds. Use when building any mobile, iOS, Android, or React Native app.
---

# Mobile (React Native + Expo)
- Expo managed workflow + Expo Router. Eject only when a native module forces it.
- Structure: app/ (routes), components/, hooks/, lib/ (api client, storage).
- State: React Query for server state, Zustand for local. AsyncStorage/SQLite for offline; queue writes when offline, flush on reconnect.
- Design for touch: 44px min targets, safe-area insets, keyboard-avoiding views on every form.
- Images: expo-image with caching; never load full-res lists.
- Test on both platforms early; platform-specific code behind Platform.select.
- Release: EAS build profiles (dev/preview/prod); env via app.config.ts, secrets never in the bundle.
