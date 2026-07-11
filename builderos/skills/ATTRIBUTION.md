# Skill Attribution

## BuilderOS-authored skills (part of BuilderOS, MIT)
`bos-patterns`, `bos-codequality`, `bos-frontend`, `bos-backend-api`, `bos-database`,
`bos-mobile`, `bos-desktop`, `bos-devops`, `bos-payments`, `bos-scraping`,
`bos-data-ml`, `bos-game`, `bos-ecommerce`, `bos-realtime`, `bos-seo`

## Vendored from ruflo (ruvnet) — MIT License
- Repository: https://github.com/ruvnet/ruflo
- License: MIT — Copyright (c) 2024-2026 ruvnet
- Directories: `agent-*`, `agentdb-*`, `flow-nexus-*`, `github-*`, `hive-mind*`,
  `v3-*`, `swarm-*`, `reasoningbank-*`, `worker-*`, and related coordination,
  memory, neural, verification, and workflow skills.

## Vendored from anthropics/skills — Apache License 2.0 (per-skill LICENSE.txt)
- Repository: https://github.com/anthropics/skills
- Only Apache-2.0-licensed skills were bundled; proprietary ones (docx, pptx,
  xlsx, pdf, doc-coauthoring) were excluded.
- Directories: `algorithmic-art`, `brand-guidelines`, `canvas-design`,
  `claude-api`, `frontend-design`, `internal-comms`, `mcp-builder`,
  `skill-creator`, `slack-gif-creator`, `theme-factory`, `web-artifacts-builder`,
  `webapp-testing`. Each keeps its own LICENSE.txt.

## Vendored from obra/superpowers — MIT License
- Repository: https://github.com/obra/superpowers
- License: MIT — Copyright (c) 2025 Jesse Vincent
- Directories: `brainstorming`, `dispatching-parallel-agents`, `executing-plans`,
  `finishing-a-development-branch`, `receiving-code-review`,
  `requesting-code-review`, `subagent-driven-development`,
  `systematic-debugging`, `test-driven-development`, `using-git-worktrees`,
  `using-superpowers`, `verification-before-completion`, `writing-plans`,
  `writing-skills`.

## Vendored from Graphify-Labs/graphify — MIT License
- Repository: https://github.com/Graphify-Labs/graphify
- License: MIT — Copyright (c) 2026 Safi Shamsi
- Directory: `graphify` (skill.md). Requires the `graphifyy` CLI
  (`pip install graphifyy`); the skill maps a codebase into a queryable
  knowledge graph.

## Vendored from NousResearch/hermes-agent — MIT License
- Repository: https://github.com/nousresearch/hermes-agent
- License: MIT — Copyright (c) 2025 Nous Research
- ~158 skills flattened from its `skills/` and `optional-skills/` category trees
  (software-development, web-development, devops, security, data-science, mlops,
  research, blockchain, finance, payments, gaming, health, productivity, email,
  communication, creative, media, computer-use, autonomous-ai-agents, and more).
- BuilderOS also adopts Hermes' learning-loop pattern (autonomous skill creation
  after complex tasks) natively via the Skill Forge phase in AUTONOMOUS_BUILD.md.

All vendored skills are redistributed under their original licenses. BuilderOS
auto-installs only the subset matching a given project idea, keeping per-session
context small.
