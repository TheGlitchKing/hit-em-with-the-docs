---
description: Audit knowledge-base facts for staleness; optionally re-verify a specific fact
allowed-tools: Bash(npx:*)
argument-hint: "[fact-id-to-verify]"
---

Arguments: $ARGUMENTS

If `$ARGUMENTS` is empty:
- Run `npx --no @theglitchking/hit-em-with-the-docs audit-facts --json` and parse the result.
- Report to the user: list of stale facts (with how many days overdue) and any unverifiable facts (malformed `last_verified`).
- For each stale fact, suggest one of three actions:
  1. Re-verify it: `/hit-em-with-the-docs:audit-facts <fact-id>`
  2. Mark it weakened (if the user knows it's no longer reliable): edit the fact's frontmatter `status: weakened`
  3. Open an incident to investigate the divergence (use `/hit-em-with-the-docs:migrate-incident` or create a new incident folder)

If `$ARGUMENTS` is a fact id:
- Run `npx --no @theglitchking/hit-em-with-the-docs audit-facts --run-verify "$ARGUMENTS" --json` and parse the result.
- If `updated` is `true`, confirm the new `last_verified` date to the user.
- If the verify command failed (`exit_code != 0`), show the stdout and stderr, then ask the user how to proceed:
  - Re-run the verify command after fixing the issue
  - Mark the fact weakened
  - Open an incident to track the divergence

Wait for the user's decision before taking any further action.
