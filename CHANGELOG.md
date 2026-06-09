# Changelog

All notable changes to this project will be documented in this file.

## [2.6.0] — 2026-06-08

Runtime custom domains. The 15 built-in domains are no longer the whole
story — projects can now register their own documentation domains at
runtime, without recompiling, via a new `hewtd domain` command and a
`domains: []` block in `.claude/hit-em-with-the-docs.json`. Minor,
additive release: the built-in domains are unchanged and remain part of
the compiled contract, and the `src/index.ts` exports are additive.

### Added

- **Custom domains via `hewtd domain add | remove | list`.** Beyond the
  15 built-ins, a project can declare its own domains. Each entry lives in
  `.claude/hit-em-with-the-docs.json` under a new `domains: []` array with
  fields `id` (kebab-case), `name`, `description`, `keywords` (≥1),
  `loadPriority` (1-10), and `category` (`core | development | features |
  advanced`). Once registered, a custom domain is valid in any doc's
  `domains:` frontmatter and its `keywords` feed `integrate`'s
  auto-classification, exactly like a built-in.
  - `hewtd domain list [--json]` — lists built-in + custom domains,
    partitioned and marked by kind.
  - `hewtd domain add <id> -k <comma,keywords> [-n name] [-d desc] [-c
    category] [--load-priority N] [--dry-run]` — validates strictly,
    writes the config entry, scaffolds `.documentation/<id>/` with
    INDEX.md/REGISTRY.md, and refreshes the root indexes. Keywords are
    REQUIRED (they're what makes the new domain discoverable to
    `integrate`). `--dry-run` prints the proposed entry + folder without
    writing. Guardrails: a built-in id, a duplicate custom id, a
    non-kebab-case id, empty keywords, or a bad category are all rejected
    with a hard error.
  - `hewtd domain remove <id>` (alias `rm`) `[--dry-run]` — removes the
    custom entry from config. **Non-destructive**: it never deletes the
    folder or the docs inside it. Any docs in `.documentation/<id>/` are
    reported as *orphaned* (left on disk, no longer a recognized domain).
    Refuses to remove a built-in domain — those are part of the compiled
    contract and always present.
- **`/hit-em-with-the-docs:domain` slash command.** A thin wrapper over
  the CLI that adds the confirm dance these mutating operations need: `add`
  previews via `--dry-run` and asks before applying (and prompts for the
  required keywords if missing); `remove` reports the orphaned-doc count
  and only applies on explicit confirmation.
- **Reserved `archive/` folder for deprecated docs.** `<docs>/archive/` is
  the parking lot for retired documentation — move a doc here instead of
  deleting it. hewtd **actively excludes** the entire `archive/` subtree
  from every scan: `audit`, `link-check`, `metadata-sync`, `integrate`
  duplicate-detection, the link graph, and `search`. Archived docs are not
  validated, never appear in any INDEX.md/REGISTRY.md, and can't break
  audit/link-check with stale frontmatter. `init` now scaffolds `archive/`
  with a README documenting the convention, and `archive` is a reserved
  name (`hewtd domain add archive` is rejected).

### Fixed

- **`loadPluginConfigSync` no longer silently falls back to defaults in
  the published package.** The sync config reader used a lazy
  `require('fs')` inside the function, which throws `require is not
  defined` in the ESM runtime the package ships as. The throw was caught
  by the fail-open `try/catch`, so every synchronous config read returned
  defaults — `vault.*` overrides and any `domains: []` entries read on the
  sync path were silently ignored regardless of what was in
  `.claude/hit-em-with-the-docs.json`. It now uses a static
  `import { readFileSync } from 'fs'`, so the sync reader actually reads
  the file. (The async `loadPluginConfig` was unaffected — it already used
  a static `fs/promises` import.)

## [2.5.0] — 2026-05-16

INDEX.md / REGISTRY.md regeneration fix. `integrate` and `maintain` now
rebuild the documentation indexes from the documents on disk via the real
generators, instead of a regex-append path that silently failed to register
the first document into any domain. Closes #7. No breaking changes — the
`src/index.ts` exports are additive.

### Fixed

- **`integrate` now registers the first document into a domain.**
  `updateDomainIndex()` could only append a row to an INDEX.md that already
  contained a markdown table. A freshly scaffolded domain INDEX.md has no
  table, so the regex never matched and nothing was written — and the failure
  was swallowed by a bare `catch`, so `integrate` still reported success. The
  first document into every domain was therefore never indexed, and projects
  without CI never got populated INDEX.md/REGISTRY.md files at all. `integrate`
  now regenerates the target domain's INDEX.md/REGISTRY.md (and the root
  indexes) from disk via the real generators, and a regeneration failure
  propagates to the caller instead of being silently swallowed. (#7)

### Added

- **`hewtd index` (alias `reindex`)** — regenerates every domain + root
  INDEX.md/REGISTRY.md from the documents on disk. `--domain <name>` restricts
  domain-file writes to one domain (root indexes are still refreshed). This is
  the recovery command `index-generator.ts` already pointed users to — it now
  exists.
- **`maintain` self-heals indexes.** A new "Step 1.5: Index Regeneration" step
  rebuilds all domain + root INDEX.md/REGISTRY.md on every `maintain` run, so
  the indexes never drift from the documents present. It also recreates any
  INDEX.md/REGISTRY.md that the domain-health check reported as missing. Runs
  in quick mode too.
- **`audit` INDEX.md drift detection.** A new `index-drift` rule flags any
  document on disk that its domain's INDEX.md fails to list (and a missing
  INDEX.md when documents are present). It is error-severity, so `audit
  --strict` gates CI on it; `failedFiles` is unchanged, so a plain `audit`
  exit code keeps its pre-2.5.0 behavior.
- **`regenerateIndexes()` / `listDomainDocFiles()`** exported from
  `src/index.ts` — the shared, single-source-of-truth index builder used by
  `integrate`, `maintain`, the `index` command, and the drift audit.

## [2.4.0] — 2026-05-15

Bug fix + recovery command for the 2.3.0 `migrate-incident` target-path
issue. No breaking changes to the public API (`src/index.ts` exports
unchanged). New CLI command `hewtd fix-legacy-layout` unblocks any
consumer who already ran the buggy 2.3.0 migrator.

### Fixed

- **`migrate-incident` now writes to `<vault-root>/incidents/<slug>/`**
  (the canonical location the `incidents/INDEX.md` generator scans).
  Previously, the target was derived from the flat file's parent
  directory, which produced folders OUTSIDE `<vault-root>/incidents/`
  when the source lived at the vault root. The `incidents/INDEX.md`
  generator missed those folders silently — `hewtd maintain` would
  report `Generated 0 incidents` despite multiple migrations having
  run. Discovered in real-world use (4 migrations in the investorhub
  repo on 2026-05-14, all required a manual `mv` to populate the
  index).

### Added

- **`hewtd fix-legacy-layout`** — relocates 2.3.0-buggy incident folders
  into `<vault-root>/incidents/`. Detects legacy folders by walking one
  level under the vault root and matching folders that:
    1. Contain a valid `narrative.md`
    2. Have `tier: incident-narrative` in frontmatter
    3. Are NOT already under `incidents/`, `facts/`, or `symptoms/`

  Moves each into `<vault-root>/incidents/<slug>/`. Refuses to clobber
  an existing canonical folder (reports `skipped` with reason). Also
  rewrites `provenance:` references in `<vault-root>/facts/*.md` that
  pointed at the moved folders (handles both fully-qualified paths
  like `.documentation/knowledge-base/<slug>/` and bare-slug refs).
  Idempotent — re-running on a clean vault is a no-op. Supports
  `--dry-run` for safe preview.

- **`migrate-incident --force`** flag. When a folder already exists at
  the canonical or legacy location, the default behavior is to no-op
  with a warning. `--force` overrides and proceeds (overwrites).

- **`migrate-incident` legacy-detection feedback.** When an
  already-migrated folder is detected at the 2.3.0-buggy location, the
  CLI surfaces it explicitly and suggests running `fix-legacy-layout`:

  ```
  Already migrated.
    Existing folder is at the 2.3.0 legacy location: .../foo/narrative.md
    Run `hewtd fix-legacy-layout` to relocate it under incidents/.
    Use --force to re-migrate (overwrites).
  ```

### Internal API

- `migrateIncident()` now **requires** an explicit `vaultRoot`
  parameter. The 2.3.0 signature inferred the target from
  `dirname(flatFilePath)`, which was the source of the bug. This is a
  breaking change to the unexported `core/knowledge-base/migrate.ts`
  surface, but `migrate.ts` was never re-exported via `src/index.ts`,
  so no public-API consumers are affected.

- New `fixLegacyLayout()` function in
  `core/knowledge-base/fix-legacy-layout.ts`. Not exported from the
  public API surface; called via the CLI command.

### Tests

- **241 passing** (was 230 at 2.3.0; +11 new).
- New: `tests/unit/knowledge-base/fix-legacy-layout.test.ts` — 8 tests
  covering move, no-op, reserved-dir safety, provenance rewrite (both
  fully-qualified and bare-slug refs), dry-run, decoy-tier skip,
  destination-collision refusal.
- Extended: `tests/unit/knowledge-base/migrate.test.ts` — 7 tests
  (was 4), new coverage for canonical target path, automatic
  `incidents/` parent creation, legacy-location idempotency detection,
  and `--force` behavior.

### Migration for consumers stuck on 2.3.0 layout

```bash
# Preview what would move
npx --no @theglitchking/hit-em-with-the-docs fix-legacy-layout --dry-run

# Apply the relocation
npx --no @theglitchking/hit-em-with-the-docs fix-legacy-layout

# Regenerate indexes
npx --no @theglitchking/hit-em-with-the-docs maintain
```

Idempotent — re-running on a clean vault is a no-op with a status
report. Safe to run multiple times.

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
