---
title: <Human-readable incident title — e.g. "Vault Down on Auth-Staging">
tier: incident-narrative
domains:
  - incidents
  - <additional-domain>   # e.g. observability, security
status: active            # active | resolved | archived
last_updated: YYYY-MM-DD
id: YYYY-MM-DD-<kebab-slug>   # MUST match the parent folder name (e.g. 2026-05-14-vault-alloy-stuck)
date: YYYY-MM-DD              # the date the incident occurred
severity: high                # one of: low | medium | high | critical
resolution_status: resolved   # one of: resolved | partial | open | planned
components:                   # REQUIRED — at least one component affected
  - <system-1>
  - <system-2>
tags:
  - <tag-1>
  - <tag-2>
---

# <Same as title>

## Summary
<One-paragraph TL;DR of what happened and how it was resolved.>

## Timeline
- HH:MM — <event 1>
- HH:MM — <event 2>
- HH:MM — <event 3>
- HH:MM — <resolution event>

## Root Cause
<The actual cause. Be specific. If unknown, say "Unknown — see Open Questions".>

## Impact
<Who/what was affected. Duration. Severity rationale. Was customer-facing? Was data lost?>

## Resolution
<How it was fixed. The exact action taken.>

## Lessons Learned
- <Lesson 1 — short, actionable>
- <Lesson 2>

## Open Questions
- <Anything unresolved that needs follow-up>

## See also
- `facts.md` — facts produced/strengthened/weakened by this incident
- <Optional links to related incidents or runbooks>
