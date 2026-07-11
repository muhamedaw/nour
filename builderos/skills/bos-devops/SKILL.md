---
name: bos-devops
description: DevOps patterns — Dockerfile, docker-compose, GitHub Actions CI/CD, environment config, deploying to VPS/Vercel/Fly. Use when containerizing, deploying, setting up CI, pipelines, or hosting.
---

# DevOps
- Dockerfile: multi-stage (build -> slim runtime), non-root user, pinned base image, .dockerignore.
- docker-compose for local dev: app + db + redis; volumes for data; healthchecks on each service.
- CI (GitHub Actions): on PR -> lint + test + build; on main -> deploy. Cache deps. Fail fast.
- Config via env only; one .env.example documenting every var; secrets in the platform secret store, never in the repo.
- Deploy by project type: static/Next -> Vercel; container -> Fly.io/VPS with compose; workers -> systemd or Fly machines.
- Rollback plan before first deploy: keep the previous image tag, one-command revert.
- Logs to stdout; one uptime check hitting /health.
