# Changelog

All notable changes to this project will be documented in this file.

## [2.3.0] — 2026-05-14

Additive minor release. **No breaking changes.** Existing tiers (guide,
standard, example, reference, admin, plan) validate exactly as they did in
2.2.0. A consumer with no knowledge-base subtree and no `symptoms:` frontmatter
blocks observes zero behavior change.

Full reference: [`docs/knowledge-base-primitives.md`](./docs/knowledge-base-primitives.md).
LLM-targeted onboarding: [`docs/LLM-GUIDE.md`](./docs/LLM-GUIDE.md).

Test coverage: **230 passing** (was 134 at 2.2.0; +96 new tests).

### Added

- **Three new tiers** for knowledge-base authoring:
  - `fact` — atomic, single-claim, citable unit with `confidence`,
    `last_verified`, optional `verify_command`, and `provenance`.
  - `incident-narrative` — immutable postmortem story; required fields
    include `date`, `severity` enum, `resolution_status` enum, and
    `components`.
  - `incident-facts` — bridge document linking an incident to the facts it
    produced/strengthened/weakened.
- **Optional `symptoms:` frontmatter field** on any tier. Maps alert names
  (exact), user phrases (fuzzy substring), and error patterns (regex) to
  playbook anchors with `cites:` to facts.
- **`LIFECYCLE_TRACKED_TIERS` constant** + `isLifecycleTrackedTier()` helper.
  Lists tiers that use status/last_verified instead of semver. Currently:
  `plan` (from 2.2.0) + `fact` + `incident-narrative` + `incident-facts`.
- **Coded error system** for KB validation. Errors carry a stable
  `KbErrorCode` (e.g. `FACT_MISSING_ID`, `PLAYBOOK_SYMPTOM_DANGLING_CITE`)
  on `AuditIssue.code`, letting tooling switch on specific violation kinds
  without substring-matching prose. See `src/core/metadata/errors.ts`.
- **`hewtd audit --strict` flag.** Exits non-zero on any error or warning
  (including KB warnings like `FACT_VERIFY_COMMAND_MULTILINE_SHEBANG`).
  Suitable for CI gating.
- **`validateKnowledgeBaseFields(data)` public API** for callers that want
  KB-only validation without running the full schema (useful for incremental
  validation in editors, generators, and the audit layer itself).
- **Four LLM-referenceable templates** at `templates/knowledge-base/` —
  `fact.template.md`, `incident-narrative.template.md`,
  `incident-facts.template.md`, and `playbook-symptoms.template.md`
  (frontmatter snippet). Bundled in the npm package.
- **Full reference doc** at `docs/knowledge-base-primitives.md`.

### Changed

- **Date-shaped frontmatter fields** (`last_updated`, `last_validated`,
  `last_verified`, `date`) now accept both quoted YYYY-MM-DD strings and
  YAML-auto-parsed `Date` objects (unquoted `2026-05-14` in YAML). The
  validator normalizes to string. This relaxation is universal — existing
  tiers benefit too. No previously-passing doc fails under the new rules.
- **`audit`'s "invalid tier" suggestion** now lists all current tiers
  dynamically from `TIERS` (was hardcoded to the original 5, missing the
  2.2.0 `plan` tier).

### Backward compatibility

- Consumers with no `knowledge-base/` and no `symptoms:` blocks: zero
  behavior change.
- `REQUIRED_FIELDS` length unchanged (6). The KB-tier-specific required
  fields are tracked separately in `TIER_REQUIRED_EXTENSIONS` and surfaced
  via the tier-aware `getMissingRequiredFields(data)`.
- `ALL_METADATA_FIELDS` length unchanged (21). KB extension fields (`id`,
  `confidence`, `provenance`, etc.) are tier-specific and intentionally
  not in the universal list — adding them would skew completeness calc on
  non-KB docs.

### PR2: Generators + config

- **`vault:` config block** in `.claude/hit-em-with-the-docs.json`:
  `root` (default `.documentation/knowledge-base/`),
  `playbook_paths` (default `[".documentation/**/*.md"]`),
  `audit_window_days` (default 90). Optional with defaults — existing
  configs without a `vault` block continue to work.
- **Three deterministic index generators** wire into `hewtd maintain`
  when a vault root exists:
  - `facts/INDEX.md` — grouped by tag → confidence, sorted by id
  - `incidents/INDEX.md` — chronological desc by date
  - `symptoms/INDEX.md` — grouped by symptom kind (alert_name |
    user_phrase | error_pattern)
- **Citation graph walker** (`src/core/knowledge-base/citers.ts`) exposes
  `buildCiterIndex()`, `findCitersInIndex()`, `citerCount()`. Used by
  the facts-index generator and the new `find-citers` CLI command.
- **Determinism guarantees:** byte-identical output across runs (snapshot
  tests verify), stable sort, no timestamps in generator output, `\n`
  line endings, padded table columns.

### PR3: CLI commands + slash command surface

Five new CLI subcommands. Each is paired with a Claude Code slash command.

- **`hewtd find-citers <fact-id>`** — walks `cites:` and `provenance:`
  edges; prints `{ fact_exists, citers, incidents_produced_in,
  incidents_strengthened_by, incidents_weakened_by }`. `--json` flag.
- **`hewtd audit-facts [--run-verify <fact-id>]`** — lists facts past
  `last_verified + audit_window_days`. `--run-verify` executes the fact's
  `verify_command` and updates `last_verified` on success; on failure,
  preserves the original. CWD: `<vault>/facts/` by default; override via
  `working_dir:` frontmatter field.
- **`hewtd extract-facts <incident-folder> --accept <json>`** — writer
  side of the extraction workflow. The LLM proposes fact specs via the
  `/hit-em-with-the-docs:extract-facts` slash command; the CLI commits
  them deterministically. Auto-populates `provenance:` to the source
  incident folder; updates the incident's `facts.md` `produced:` list
  (idempotent).
- **`hewtd cite <fact-id> --file <playbook>`** — inserts a `cites:` entry
  into the nearest `symptoms:` block, or creates a new block if none
  exists. Idempotent — re-citing the same fact in the same entry is a
  no-op. `--dry-run` to preview.
- **`hewtd migrate-incident <flat-file>`** — converts a legacy flat-file
  incident into the folder form (`narrative.md` + `facts.md` skeleton +
  empty `evidence/`). Original renamed to `.migrated` for rollback.
  Idempotent.

### LLM onboarding

- **`/hit-em-with-the-docs:help`** slash command with optional topic
  argument (`frontmatter | knowledge-base | commands | audit | integrate
  | templates`). Briefs the LLM directly on hewtd's surface.
- **`docs/LLM-GUIDE.md`** — concise (~150 lines) agent-facing reference
  with a decision tree, tier-picking heuristics, KB authoring workflows,
  command tables, and an anti-pattern list.

### Tests

- **230 passing** (was 134 at 2.2.0 baseline; +96 new tests).
- New coverage for: the 3 new tiers, `LIFECYCLE_TRACKED_TIERS`,
  `validateKnowledgeBaseFields` (every error code), date-tolerance, audit
  strict-mode, citation graph, three generators (snapshot + determinism),
  audit-facts, cite, extract-facts, migrate-incident, full pipeline
  integration test.
- Fixture trees at `tests/fixtures/knowledge-base/{valid,invalid}/`.
- Backward-compat regression test at
  `tests/integration/no-vault-backcompat.test.ts` — load-bearing
  guarantee that pre-2.3.0 projects observe zero behavior change.

## [2.1.0] — 2026-04-18

Additive minor release. No breaking changes. Existing behavior is
preserved; the new surface is opt-in and off by default (update policy
defaults to `nudge` — one-line notification when a new version is
available, no automatic changes).

### Added
- Adopts
  [`@theglitchking/claude-plugin-runtime`](https://github.com/TheGlitchKing/claude-plugin-runtime)
  (`^0.1.0`) for standardized update management across all plugins in
  the marketplace.
- **Postinstall step** (`scripts/link-skills.js`) now runs on
  `npm install` — writes a default `.claude/hit-em-with-the-docs.json`
  with `{ "updatePolicy": "nudge" }`, and registers a SessionStart hook
  in `.claude/settings.json` if one exists (skipped when the plugin
  marketplace version is already enabled in `~/.claude/settings.json`,
  or when `HIT_EM_WITH_THE_DOCS_SKIP_HOOK_REGISTER=1` is set).
- **SessionStart hook** (`hooks/session-start.js`) checks npm for a
  newer version of `@theglitchking/hit-em-with-the-docs` at session
  start and acts per policy:
  - `off` — silent, no network call
  - `nudge` *(default)* — prints a one-liner via `additionalContext`
  - `auto` — runs `npm update` and prints an upgrade confirmation
  - 3s network budget, 6h cache, CI-skip, fail-open on any error
- **Four new subcommands** (slash + CLI parity):
  - `/hit-em-with-the-docs:update` / `hewtd update`
  - `/hit-em-with-the-docs:policy [auto|nudge|off]` / `hewtd policy`
  - `/hit-em-with-the-docs:status` / `hewtd status`
  - `/hit-em-with-the-docs:relink` / `hewtd relink`

### Fixed
- `--version` now reads dynamically from `package.json` via
  `createRequire`. Previously hardcoded at `'2.0.0'`, which drifted out
  of sync with `package.json` (caused `hewtd --version` to lie about
  the installed version for all of 2.0.1 / 2.0.2).

### Migration

No action required for existing users — the new behaviors are
conservative and on-by-default only in their minimal form (nudge-only
update check). To take advantage of the new surface:

```bash
# From anywhere in your project:

# View installed version, latest on npm, current policy, and hook state
npx --no @theglitchking/hit-em-with-the-docs status

# Opt into automatic updates on session start
npx --no @theglitchking/hit-em-with-the-docs policy auto

# Or silence the update check entirely
npx --no @theglitchking/hit-em-with-the-docs policy off
```

If you had the plugin installed via the Claude Code marketplace
(`/plugin install`), running `npm install` as a project-level dep will
detect that and skip registering the project-level hook — the
marketplace plugin handles SessionStart events on its own. No duplicate
hook firing.

**Opt-outs** (env vars):

| Variable | Effect |
|---|---|
| `HIT_EM_WITH_THE_DOCS_UPDATE_POLICY` | One-shot policy override for the current session |
| `HIT_EM_WITH_THE_DOCS_SKIP_LINK=1` | Skip skill symlinking (no-op for this plugin — ships no skills) |
| `HIT_EM_WITH_THE_DOCS_SKIP_HOOK_REGISTER=1` | Skip writing the SessionStart hook into `.claude/settings.json` |

---

## [2.0.2] and earlier

See git history:
https://github.com/TheGlitchKing/hit-em-with-the-docs/commits/main
