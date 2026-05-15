---
title: Grafana Alerts Runbook
tier: admin
domains:
  - observability
status: active
last_updated: 2026-05-14
version: 1.0.0
symptoms:
  - alert_name: "Vault Down — auth-staging"
    severity: critical
    target: "#vault-down-auth-staging"
    cites:
      - alloy-env-set-at-entrypoint-only
  - user_phrase:
      - metrics missing
      - scrape down
    severity: medium
    target: "#vault-down-auth-staging"
    cites:
      - alloy-env-set-at-entrypoint-only
---

# Grafana Alerts Runbook

## Vault Down auth-staging
1. Check Vault health directly via `curl https://vault.../v1/sys/health`.
2. If Vault is healthy, suspect Alloy. Run `docker exec alloy ps aux` to inspect.
3. If Alloy's scrape worker is stuck, restart with `docker compose restart alloy`.
