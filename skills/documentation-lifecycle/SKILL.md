---
name: documentation-lifecycle
description: Create, update, retire, or reorganize documentation in a project managed by hit-em-with-the-docs (a `.documentation/` tree with domain folders). Use when writing a new doc, updating an existing one, deleting/deprecating/archiving a doc, fixing a broken docs link, wondering where a doc belongs, or when an INDEX.md/REGISTRY.md looks out of date. Also use when a tool call was denied by the hewtd lifecycle guard.
---

# Documentation lifecycle (hit-em-with-the-docs)

This project's docs live in `.documentation/`, split into domain folders. hewtd
owns that tree: it classifies documents, maintains their frontmatter, generates
the indexes, checks the links, and retires docs without destroying them.

**The one thing to internalize:** `INDEX.md` and `REGISTRY.md` are *generated*.
They are rebuilt from the documents on disk on every `hewtd index` / `hewtd
maintain`. Editing them by hand accomplishes nothing — your rows are overwritten
on the next run. To change what an index says, change the documents, then
regenerate.

Run every command with `npx hit-em-with-the-docs …` (or `hewtd …`).

## Creating a doc

Write the markdown wherever is convenient, then:

```bash
hewtd integrate path/to/new-doc.md          # classifies + moves + registers it
hewtd integrate path/to/new-doc.md --dry-run  # preview the chosen domain first
```

`integrate` picks the domain by keyword-matching the content, moves the file
into `.documentation/<domain>/`, stamps frontmatter (`status: draft`, `tier:
guide`, `version: 1.0.0`, `last_updated`, `word_count`), and regenerates the
indexes. It never overwrites frontmatter you wrote yourself — it only fills what
is missing.

A markdown file left outside `.documentation/` is invisible to hewtd: not
indexed, not link-checked, not validated. Don't hand-create `docs/` folders.

## Updating a doc

Edit the document normally, then:

```bash
hewtd maintain --quick     # regenerate indexes + sync metadata
hewtd maintain --fix       # also auto-fix what it can
```

Never hand-edit `INDEX.md` or `REGISTRY.md` — a `PreToolUse` guard denies it.

## Retiring a doc

**Documents are never deleted.** hewtd's own source contains no `rm`/`unlink`
calls anywhere, and the guard denies shell deletion of anything under
`.documentation/`.

Two distinct steps, often confused:

| | What it does |
|---|---|
| `status: deprecated` | Flags *intent*. The doc stays in its domain folder, still indexed, still scanned. `audit` raises an INFO nudge toward archiving. |
| `hewtd archive <file>` | Actually retires it. |

```bash
hewtd archive .documentation/api/old-guide.md --dry-run
hewtd archive .documentation/api/old-guide.md -r "superseded by v2 guide"
hewtd unarchive .documentation/archive/api/old-guide.md   # lossless restore
```

`archive` moves the doc to `archive/<same-subpath>/` (preferring `git mv` to keep
history), stamps `status: archived`, `archived_on`, `archived_from`, and
`archived_reason`, and reindexes so it drops out of its domain INDEX. The
`archived_from` stamp is what makes `unarchive` exact — **a hand-rolled `mv`
loses it**, and there is then nothing to restore from.

**Link guard:** `archive` refuses if active docs still link to the target,
listing each offender so you can fix them first. `--force` overrides, and the
inbound links go dangling.

`hewtd archive-candidates` lists docs that may warrant retiring — advisory and
read-only, it never moves anything. Nothing is ever auto-archived.

Point a replacement at the old doc with `superseded_by: <path>` in frontmatter.

## Checking the tree

```bash
hewtd audit                # policy + drift violations, health score
hewtd link-check           # broken internal links
hewtd index --dry-run      # what the indexes would become
```

`audit`'s `index-drift` rule reports any document on disk that its domain's
`INDEX.md` fails to list — the fix is always `hewtd index`.

## If the guard denied your tool call

It denies exactly two things, both destructive:

- **Editing a generated `INDEX.md`/`REGISTRY.md`** → change the documents and run
  `hewtd index`.
- **Deleting a doc under `.documentation/`** → use `hewtd archive` instead.

Both rules are opt-out via `.claude/hit-em-with-the-docs.json`:

```json
{ "enforcement": { "block_index_edits": true, "block_doc_deletion": true } }
```

Turning one off is a deliberate choice by the human who owns the repo — not
something to do to get past a denial.
