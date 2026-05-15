---
title: Bad runbook (missing target)
tier: admin
domains:
  - observability
status: active
last_updated: 2026-05-14
version: 1.0.0
symptoms:
  - alert_name: "Some Alert"
    cites:
      - some-fact
---

# Bad runbook

A symptoms entry missing its `target:` field — triggers PLAYBOOK_SYMPTOM_MISSING_TARGET.
