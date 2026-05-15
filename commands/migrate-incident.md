---
description: Convert a legacy flat-file incident into the 2.3.0 folder form
allowed-tools: Bash(npx:*), Read
argument-hint: "<path-to-flat-incident.md>"
---

Arguments: $ARGUMENTS

- If `$ARGUMENTS` is empty, ask the user for the path to the flat-file incident.
- Read the flat file to understand its content and frontmatter.
- Run `npx --no @theglitchking/hit-em-with-the-docs migrate-incident "$ARGUMENTS" --dry-run` to see the proposed migration plan (target folder, narrative.md content, facts.md skeleton).
- Show the user the proposed plan:
  - Where the new folder will live
  - What the narrative.md frontmatter will look like (especially `severity`, `resolution_status`, `components` — these are required and may need user input if the original lacks them)
  - That the facts.md will be a skeleton with empty `produced:` (the user will use `/hit-em-with-the-docs:extract-facts` after migration to populate it)
- Ask the user to confirm or adjust any defaults (especially severity / components if they look wrong).
- On confirmation, re-run without `--dry-run`. The original file is renamed to `<name>.md.migrated` for rollback safety.
- After migration, suggest the user run `/hit-em-with-the-docs:extract-facts <target-folder>` to extract atomic facts from the narrative.
