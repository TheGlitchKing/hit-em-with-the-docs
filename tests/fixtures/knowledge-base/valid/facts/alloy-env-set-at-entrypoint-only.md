---
title: Alloy reads env only at entrypoint
tier: fact
domains:
  - observability
status: active
last_updated: 2026-05-14
id: alloy-env-set-at-entrypoint-only
confidence: high
last_verified: 2026-05-14
verify_command: |
  docker exec alloy printenv VAULT_TOKEN
provenance:
  - incidents/2026-05-14-vault-alloy-stuck/
sources:
  - ops/alloy/docker-compose.yml
tags:
  - alloy
  - env-vars
---

# Alloy reads env only at entrypoint

## Claim
Grafana Alloy reads environment variables at container entrypoint only. It does not
refresh them mid-run; changes to `.env` require a restart to take effect.

## How to verify
After updating a value in `.env`, run `docker exec alloy printenv VAR`. The value
shown is the entrypoint-captured value, not the current `.env` value.

## Consequences
Updating Vault tokens via `.env` requires `docker compose restart alloy`, not a
config reload or signal.
