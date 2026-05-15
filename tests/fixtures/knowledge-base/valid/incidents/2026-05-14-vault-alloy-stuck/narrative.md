---
title: Vault Down on Auth-Staging
tier: incident-narrative
domains:
  - incidents
  - observability
status: active
last_updated: 2026-05-14
id: 2026-05-14-vault-alloy-stuck
date: 2026-05-14
severity: high
resolution_status: resolved
components:
  - vault
  - alloy
  - grafana
tags:
  - vault
  - alloy
---

# Vault Down on Auth-Staging

## Timeline
- 14:02 — Grafana alert "Vault Down — auth-staging" fires
- 14:05 — On-call investigates, finds Vault is responding normally
- 14:15 — Alloy scrape worker identified as stuck
- 14:18 — Alloy restarted, alert clears

## Root Cause
Grafana Alloy's scrape worker hung on a stale connection. Vault itself was healthy.

## Impact
False-positive page during off-hours. No actual customer-facing outage.

## Resolution
Restarted the Alloy container.

## Lessons Learned
- Alloy can produce false-positive metric outages.
- Runbook should check Alloy before assuming Vault is down.
