---
name: bos-data-ml
description: Data pipelines and ML integration — pandas/polars processing, dataset hygiene, training loops, evaluation, local LLM/Ollama integration, embeddings. Use for data analysis, CSV processing, machine learning, training, or AI features.
---

# Data / ML
- Pipeline shape: raw/ -> processed/ -> outputs/, each step a rerunnable script; never mutate raw data.
- Validate at load: expected columns, dtypes, row-count sanity; fail loudly with the actual diff.
- Split before any tuning (train/val/test); fix random seeds; log every run params + metrics to runs.jsonl.
- Baseline first (mean predictor / logistic regression) — a fancy model must beat it to exist.
- Metrics chosen by the problem (not accuracy on imbalanced data); report on the untouched test set once.
- LLM features: local Ollama first, API behind an env key; validate/parse model output before acting on it; cache responses keyed by prompt hash.
- Embeddings: store with the text and the model name; re-embed when the model changes.
