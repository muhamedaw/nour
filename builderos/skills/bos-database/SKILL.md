---
name: bos-database
description: Database schema design, migrations, indexing, and query patterns for PostgreSQL/SQLite/Redis. Use when a project stores data, needs a schema, models, ORM, SQL, migrations, or caching.
---

# Database
- Start SQLite for MVP unless concurrency/scale demands Postgres; the repository layer makes swapping cheap.
- Schema rules: pick one naming convention and stick to it; id PK, created_at/updated_at on every table; FKs with explicit ON DELETE behavior.
- Migrations from the first table (Alembic/Prisma/numbered SQL files). Never edit an applied migration.
- Index every FK and every column used in WHERE/ORDER BY of a hot query. No premature composite indexes.
- N+1 is the default bug: batch or join; log query counts in dev.
- Transactions around multi-write operations; keep them short.
- Redis only for cache/queues/sessions — never the source of truth. Set TTLs.
- Backups: a dump script in scripts/ from day one.
