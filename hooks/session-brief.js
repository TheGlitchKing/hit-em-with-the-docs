#!/usr/bin/env node
// hit-em-with-the-docs SessionStart hook — the lifecycle brief.
//
// A separate hook from session-start.js on purpose: the plugin runtime owns
// stdout for that one (it always emits exactly one SessionStart response for
// the update check, and offers no way to append to it). Claude Code runs every
// registered SessionStart hook and merges their context, so this stays
// decoupled from the runtime instead of monkey-patching it.
//
// Emits nothing at all outside a hewtd-managed project.
//
// This exists because the policy used to live only in the README and in an
// orphaned template that was never installed: an agent that had never heard of
// hewtd would `rm` a stale doc, hand-edit a generated INDEX.md, or invent its
// own `docs/` folder. The PreToolUse guard now denies the destructive half of
// that; this is what stops the agent walking into the guard in the first place.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Not a hewtd project → say nothing. This hook runs in every session the
// plugin is installed in, most of which have no documentation tree.
if (!existsSync(resolve(projectRoot, '.documentation'))) {
  process.exit(0);
}

// Stated as facts, not instructions. Imperative text injected into context can
// trip Claude's prompt-injection defenses; a description of how the repo works
// does not.
const BRIEF = `This project's documentation is managed by hit-em-with-the-docs (hewtd), under \`.documentation/\`, organized into domains (security, api, database, …).

How the tree works:
- \`INDEX.md\` and \`REGISTRY.md\` are **generated artifacts**, rebuilt from the documents on disk. Hand-edits to them are overwritten by the next \`hewtd index\`. To change what an index lists, change the documents.
- New docs are registered with \`hewtd integrate <file>\`, which classifies them into a domain and adds the frontmatter. Markdown created outside \`.documentation/\` is not indexed, link-checked, or validated.
- Docs are **never deleted**. \`hewtd archive <file>\` retires one: it moves the file under \`archive/\` (keeping git history), stamps \`archived_from\` so \`hewtd unarchive\` restores it exactly, and refuses if active docs still link to it. hewtd's own source contains no delete calls anywhere.
- \`status: deprecated\` flags intent but leaves a doc live and indexed; \`hewtd archive\` is the step that actually retires it.
- \`hewtd maintain\` regenerates indexes, syncs metadata, and checks links. \`hewtd audit\` reports drift and policy violations.

A PreToolUse hook enforces the two destructive cases: editing a generated index, and deleting a doc under \`.documentation/\`. Both are denied. Run \`/hit-em-with-the-docs:help\` for the full command surface.`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: BRIEF,
    },
  }) + '\n'
);
