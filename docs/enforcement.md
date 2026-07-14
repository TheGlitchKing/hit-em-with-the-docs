# Lifecycle enforcement (2.8.0+)

hewtd's documentation policy used to be enforced **only at the CLI boundary**.
The archive link guard refuses an unsafe move; `auto: false` prevents
auto-archiving; the frontmatter schema rejects bad metadata. All of that holds
for anyone who calls the CLI.

None of it bound an **agent**. Claude working in a hewtd-managed repo — with no
particular knowledge of hewtd — would happily `rm` a stale doc, hand-edit a
generated `INDEX.md`, or start its own `docs/` folder. The policy lived in the
README, which nothing made it read.

2.8.0 closes that. Three layers, in descending order of strength.

## 1. The guard (enforcement)

A `PreToolUse` hook. It is run **by the harness, not by the model**, so it is the
only mechanism here that is genuinely binding: Claude cannot reason its way past
a denial.

It **denies** exactly two things, both destructive:

| Denied | Why | Instead |
|---|---|---|
| `Write`/`Edit` on a generated `INDEX.md` / `REGISTRY.md` under the docs tree | It is rebuilt from disk on the next run — hand-edits are silently discarded, and hand-curated rows are how [#12](https://github.com/TheGlitchKing/hit-em-with-the-docs/issues/12) went unnoticed for so long | Change the documents, then `hewtd index` |
| `rm` / `git rm` / `shred` of a doc under the docs tree | Irreversible, and hewtd has a reversible alternative. hewtd's own source contains **no delete calls anywhere** | `hewtd archive <file>` |

It **warns** (allows the call, and tells the model why) on:

- Setting `status: deprecated` — that flags intent but leaves the doc live and
  indexed; `hewtd archive` is the step that retires it.
- Starting a rival `docs/` tree, or dropping a loose doc at the repo root —
  markdown outside `.documentation/` is not indexed, link-checked, or validated.
- `mv`-ing a doc into `archive/` by hand — it skips the `archived_from` stamp,
  so `hewtd unarchive` has nothing to restore from.

### Two invariants it will not violate

The guard runs in **every session where the plugin is installed**, including
repos that have nothing to do with hewtd. So:

1. **No `.documentation/` tree → it allows everything, instantly and silently.**
2. **Any internal error → it allows the call.** It fails open, unconditionally.
   A guard that blocks your unrelated work because it threw is worse than no
   guard.

The warnings are also deliberately narrow. A `.md` under `src/`, a subpackage
`README.md`, a test fixture, a website's own content — none of them trigger
anything. A noisy guard is a guard people switch off.

### Turning it off

Both rules are opt-out, in `.claude/hit-em-with-the-docs.json`:

```json
{
  "enforcement": {
    "block_index_edits": true,
    "block_doc_deletion": true
  }
}
```

Both default to `true`. Set either to `false` to disable that rule; the other
stays active. This is a decision for the human who owns the repo — not something
an agent should do to get past a denial.

## 2. The session brief (awareness)

A second `SessionStart` hook injects a compact description of how the tree works
— generated indexes, `integrate` for new docs, `archive` instead of delete —
**only when the project actually has a `.documentation/` tree**.

It writes no files. It deliberately does *not* create or modify `CLAUDE.md`,
which you almost certainly already have and which is yours.

It is phrased as a description of the repo, not as instructions. (Imperative text
injected into context can trip Claude's prompt-injection defenses; a statement of
fact does not.)

## 3. The skill (capability)

`skills/documentation-lifecycle/SKILL.md` is model-invocable: Claude reaches for
it on its own when asked to write, update, retire, or reorganize documentation,
instead of needing you to run `/hit-em-with-the-docs:help` first. It carries the
full command surface — `integrate`, `maintain`, `archive`/`unarchive`,
`archive-candidates`, `audit` — and what to do when the guard denies something.

## Why layered

The guard alone would be a wall of denials with no explanation of the right path.
The brief and the skill alone would be advice the model is free to ignore. The
guard stops the irreversible things; the other two are what keep an agent from
walking into it in the first place.
