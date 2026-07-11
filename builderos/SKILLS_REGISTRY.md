# Builder OS — Skills Registry

> Auto-updated by Claude Code after each session.
> Last sync: 2026-05-30

---

## What This Tracks

Every pattern, technique, or architectural decision that proved valuable gets logged here. This makes every future project smarter than the last.

---

## Active Skills

| Skill | When to Apply | First Used In | Date |
|-------|--------------|--------------|------|
| Mobile-first layout | Every UI project | — | — |
| FastAPI + PostgreSQL baseline | Python backend projects | — | — |
| Next.js App Router | Web app projects | — | — |
| Tauri desktop scaffold | Desktop app projects | — | — |
| shadcn/ui component system | Any React/Next.js UI | — | — |
| Framer Motion animations | UI polish phase | — | — |
| Docker Compose local dev | Any project with services | — | — |

---

## Pattern Library

> Reusable architectural patterns discovered during projects:

### Authentication
- [ ] JWT + refresh token pattern
- [ ] OAuth2 social login flow
- [ ] Session-based auth (FastAPI)

### Data Layer
- [ ] Repository pattern (clean separation from ORM)
- [ ] Redis caching layer
- [ ] Database migration system (Alembic / Prisma)

### Frontend
- [ ] Optimistic UI updates
- [ ] Skeleton loading states
- [ ] Error boundary system
- [ ] Toast notification system

### AI Integration
- [ ] Ollama local model setup
- [ ] Streaming response handler
- [ ] RAG pipeline baseline

---

## Skills Added Per Project

| Project Path | Skills Used | New Patterns Discovered | Date |
|-------------|------------|------------------------|------|
| tybian (vanilla JS CP) | localStorage-fallback boot, undo/redo history stack, write-through sv() | HTML-before-JS crash pattern: grep onclick= before declaring feature done | 2026-06-09 |
| BuilderOS/templates/web-nextjs | BuilderOS v2 Web Template — for new web projects | Next.js App Router scaffold | 2026-06-18 |
| BuilderOS/templates/api-fastapi | BuilderOS v2 API Template — for new API projects | FastAPI + Docker scaffold | 2026-06-18 |
| BuilderOS/templates/mobile-expo | BuilderOS v2 Mobile Template — for new mobile projects | Expo Router scaffold | 2026-06-18 |

## Vanilla JS Patterns (no framework)

### localStorage write-through persistence
When server may be unavailable, `sv(k,v)` must also write to `localStorage('ls_cp_'+k)`. `boot()` loads from localStorage on server fail. Old-CP raw keys (`andalus_*`) checked as secondary fallback.

### Client-side undo/redo
`cpHistory[]` array + `cpHistIdx` pointer. `cpSnapshot(label)` deep-copies mutable DB fields before destructive ops. Max 30 entries. Hooks: before add, edit, delete.

### HTML-before-JS crash prevention
In monolithic HTML+JS files, `onclick="fn()"` in HTML will crash silently if `fn` isn't defined when the event fires — even if no one clicks. Always grep all `onclick=` references and verify every target function is defined before closing a task.
