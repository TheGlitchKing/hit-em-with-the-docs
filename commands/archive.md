---
description: Deprecate/retire a doc — move it into archive/ (reversible, link-safe), or list archival candidates
allowed-tools: Bash(npx:*), Read
argument-hint: "candidates | archive <file> [--reason ...] | unarchive <file>"
---

Arguments: $ARGUMENTS

This command wraps `npx --no @theglitchking/hit-em-with-the-docs <archive|unarchive|archive-candidates>`. It retires deprecated docs into `.documentation/archive/` (which hewtd excludes from all scans) — properly: history-preserving move, metadata stamp, reindex, and a link-safety guard. Dispatch on the first word of `$ARGUMENTS`:

## `candidates` (or empty arguments)

- Run `npx --no @theglitchking/hit-em-with-the-docs archive-candidates` and report the suggestions with their reasons/scores. This is **advisory and read-only** — nothing moves. Offer to archive any the user confirms.

## `archive <file>`

Moves the doc into `archive/<same-domain-path>/`, stamps `status: archived` + `archived_on` + `archived_from` (+ `archived_reason` if given), and reindexes.

- **Preview first** (always): run with `--dry-run`:
  ```bash
  npx --no @theglitchking/hit-em-with-the-docs archive <file> [--reason "..."] --dry-run
  ```
- The dry-run reports any **active docs that link to this doc**. If there are inbound links:
  - Surface them to the user (file:line). Archiving will leave them dangling.
  - Recommend fixing those links first. Only proceed with `--force` on **explicit** user confirmation.
- If the user did not give a reason, ask for one (it's recorded in `archived_reason`).
- On confirmation, re-run without `--dry-run` (add `--force` only if the user accepted the dangling-link tradeoff). Suggest `hewtd maintain` afterward.

## `unarchive <file>`

Restores an archived doc back to its original path (`archived_from`), `status: active`.

- Run with `--dry-run` to show where it will land, then re-run for real on confirmation:
  ```bash
  npx --no @theglitchking/hit-em-with-the-docs unarchive <file> --dry-run
  ```
- If it reports the restore target already exists, relay that and don't force it.

## Notes

- Criteria for archiving (what `candidates` ranks on): `status: deprecated` (strongest) → `superseded_by:` → orphaned (no inbound links) → age (only when also orphaned). **Age alone never qualifies a doc** — an unchanged doc is often the most important one.
- Don't hand-move files into `archive/`; the command does the metadata + reindex + link check that a bare `mv` skips.
- If the first word isn't `candidates`, `archive`, or `unarchive`, tell the user those are the valid subcommands.
