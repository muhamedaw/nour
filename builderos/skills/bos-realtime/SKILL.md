---
name: bos-realtime
description: Realtime feature patterns — WebSockets, Server-Sent Events, polling tradeoffs, presence, sync, reconnection. Use for chat, live updates, notifications, multiplayer, collaborative editing, or live dashboards.
---

# Realtime
- Cheapest transport that works: polling (30s+) -> SSE (server push only) -> WebSocket (bidirectional). Most realtime needs are SSE.
- Reconnect logic is not optional: exponential backoff + jitter, resume from last-event-id (SSE gives this free).
- Messages: versioned JSON envelopes {type, v, payload}; unknown types ignored, never crash.
- Server keeps connections dumb: auth on connect, channel subscribe, fan-out; business logic stays in normal request handlers.
- Presence = heartbeat + TTL in Redis, not open-socket bookkeeping alone.
- Optimistic UI on send; reconcile on server echo; show pending state.
- Scale later: in-process pubsub first; Redis pubsub when more than one instance.
