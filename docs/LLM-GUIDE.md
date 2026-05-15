# LLM guide to `hit-em-with-the-docs`

> A concise, agent-facing brief on what this plugin does and the specific workflows you'll perform. **Read this first** when working in a project that uses hewtd. For complete reference, see README.md (long).

## 30-second model

**hewtd manages `.documentation/`.** Every markdown file there has YAML frontmatter validated against a 9-tier, 22-field schema. The plugin scaffolds the tree, classifies new docs, audits for compliance, checks internal links, and (as of 2.3.0) maintains a knowledge-base subtree at `.documentation/knowledge-base/` with citable atomic facts, postmortem incidents, and playbook-symptom mappings.

You are the **writer**. The plugin is the **validator + indexer**. The user is the **owner** of what gets written.

## Decision tree

**Is the user asking you to add documentation?**
→ Determine the tier (see "Picking a tier" below). Write the markdown with proper frontmatter. Place it in the right domain folder. After saving, suggest the user run `hewtd maintain` (or do it via Bash if authorized).

**Is the user asking you to capture an incident or atomic fact?**
→ This is the 2.3.0 knowledge-base workflow. See "Knowledge-base authoring" below.

**Is the user reporting a doc-health issue (broken links, missing frontmatter, stale content)?**
→ Run `hewtd audit` (or `audit --strict` for CI-style checking). Triage the issues. Use `metadata-sync --fix` to backfill missing fields.

**Is the user just exploring or asking how to use hewtd?**
→ Invoke `/hit-em-with-the-docs:help`. Or quote relevant sections of this guide.

## Picking a tier

| Tier | Pick when... |
|---|---|
| `guide` | The doc walks the reader through doing something step-by-step. |
| `standard` | The doc defines conventions, rules, or "do / don't" patterns. |
| `example` | The doc is primarily code samples or templates. |
| `reference` | The doc is an exhaustive API/schema/specification listing. |
| `admin` | The doc covers operational procedures (deployment, monitoring, etc.). |
| `plan` | The doc is a phase/task/atom planning artifact (persistent-planning lg-mode). |
| `fact` | The doc is a single atomic citable claim (2.3.0+). |
| `incident-narrative` | The doc is a postmortem story (2.3.0+). |
| `incident-facts` | The doc bridges an incident to facts it produced (2.3.0+). |

If unsure, write 2-3 sentences of body, then ask `hewtd discover patterns` or read a few neighboring docs in the target domain to match style.

## Universal frontmatter (required, every doc)

```yaml
---
title: <Human readable>
tier: <one of the 9 tiers>
domains:                # array, ≥1; see DOMAINS list below
  - <domain-name>
status: active          # draft | active | deprecated | archived (free-form for lifecycle-tracked tiers)
last_updated: YYYY-MM-DD
version: 1.0.0          # semver — OPTIONAL for lifecycle-tracked tiers
---
```

Lifecycle-tracked tiers (`plan`, `fact`, `incident-narrative`, `incident-facts`) skip `version` and use tier-specific status enums. See per-tier extensions in `docs/knowledge-base-primitives.md` and `docs/plan-tier-frontmatter.md`.

## The 15 domains

`security`, `devops`, `database`, `api`, `standards`, `testing`, `architecture`, `features`, `quickstart`, `procedures`, `workflows`, `agents`, `backups`, `troubleshooting`, `plans`.

Files belong in `<docs-path>/<domain>/<filename>.md`. The auditor warns when files appear to be in the wrong domain.

## Knowledge-base authoring (2.3.0+)

The KB subtree lives at `.documentation/knowledge-base/` by default (configurable via `.claude/hit-em-with-the-docs.json` → `vault.root`).

```
<vault-root>/
├── facts/                    # one .md per fact, filename = id
├── incidents/
│   └── <YYYY-MM-DD-slug>/
│       ├── narrative.md      # the postmortem
│       └── facts.md          # bridge to produced/strengthened/weakened facts
└── (auto-generated indexes — don't edit by hand)
    ├── facts/INDEX.md
    ├── incidents/INDEX.md
    └── symptoms/INDEX.md
```

### Creating a fact

1. Pick a kebab-case id (e.g. `alloy-env-set-at-entrypoint-only`).
2. Copy `templates/knowledge-base/fact.template.md` into `<vault-root>/facts/<id>.md`.
3. Fill required fields: `id`, `confidence` (high|medium|low|hypothesis), `last_verified` (YYYY-MM-DD), `provenance` (≥1 entry pointing at incident, source path, or doc).
4. Optional but recommended: `verify_command` — a single shell command that proves the claim.
5. Body: `## Claim` (one paragraph), `## How to verify`, `## Consequences`.

### Creating an incident

1. Folder: `<vault-root>/incidents/YYYY-MM-DD-slug/` (date + kebab-case slug).
2. `narrative.md` from the template. Required: `id` (matches folder), `date`, `severity` (low|medium|high|critical), `resolution_status` (resolved|partial|open|planned), `components` (≥1).
3. `facts.md` from the template. Required: `incident_id` (matches narrative), `produced` (array, may be empty).

### Enriching a playbook

Playbooks stay where they are (`troubleshooting/`, `devops/`, etc.). Add a `symptoms:` block to the frontmatter — see `templates/knowledge-base/playbook-symptoms.template.md` for the snippet. Each entry needs one of `alert_name` | `user_phrase` | `error_pattern`, a `target` (anchor or path), and a non-empty `cites` array of fact ids.

## Commands you'll invoke

Use Bash to run these. They're all available via `npx --no @theglitchking/hit-em-with-the-docs <cmd>` (or `hewtd <cmd>` if installed globally).

| Command | When to run |
|---|---|
| `hewtd init` | Once, at project setup. Idempotent with `--force`. |
| `hewtd maintain` | After adding/changing docs. Updates indexes, runs full audit. |
| `hewtd audit` | Spot-check compliance. Exits 1 on errors. |
| `hewtd audit --strict` | CI gate. Exits 1 on any error OR any KB-coded violation. Stylistic warnings (naming, placement) don't fail strict. |
| `hewtd link-check` | Validate internal links. Run after moves/renames. |
| `hewtd metadata-sync --fix` | Backfill missing frontmatter fields. |
| `hewtd integrate <file>` | Auto-classify and place a raw markdown file. |
| `hewtd discover patterns` | Extract coding patterns from source code. |
| `hewtd discover anti-patterns` | Detect anti-patterns in source code. |
| `hewtd report {health\|audit\|links}` | Generate a saved report. |
| `hewtd search <query>` | Cross-doc text search. |
| `hewtd list` | List all 15 domains. |

## Slash commands (Claude Code)

| Command | What it does |
|---|---|
| `/hit-em-with-the-docs:help` | Orient yourself or the user on hewtd's surface |
| `/hit-em-with-the-docs:status` | Show installed version, update policy, hook state |
| `/hit-em-with-the-docs:policy [auto\|nudge\|off]` | Get/set the update policy |
| `/hit-em-with-the-docs:update` | Update to the latest version |
| `/hit-em-with-the-docs:relink` | Re-run the skill linker (no-op for hewtd; useful for plugin-stack debugging) |

## Validation: error codes

When `hewtd audit` reports an `AuditIssue.code`, it's one of the 2.3.0 KB error codes. The full list lives in `docs/knowledge-base-primitives.md` ("Error codes" table). The most common ones you'll need to fix:

- `FACT_MISSING_ID` — fact has no `id` or `id` is not kebab-case
- `FACT_INVALID_CONFIDENCE` — `confidence` is not one of high|medium|low|hypothesis
- `FACT_MISSING_PROVENANCE` — `provenance` empty or missing
- `INCIDENT_NARRATIVE_INVALID_SEVERITY` — `severity` is not in enum
- `PLAYBOOK_SYMPTOM_MISSING_TARGET` — a `symptoms[]` entry has no `target`
- `PLAYBOOK_SYMPTOM_MISSING_CITES` — a `symptoms[]` entry has empty `cites`

## What NOT to do

- **Don't write to `<vault-root>/{facts,incidents,symptoms}/INDEX.md`** — those are auto-generated. Edits will be overwritten on the next `hewtd maintain`.
- **Don't invent new tiers** — the 9 in this guide are exhaustive. If you think you need a new tier, ask the user.
- **Don't skip frontmatter** — every doc in `.documentation/` needs it. The auditor will flag missing fields.
- **Don't move docs between domains without running `hewtd link-check` afterward** — internal links break silently otherwise.
- **Don't manually quote dates in YAML if you don't have to** — as of 2.3.0, both `last_updated: 2026-05-14` and `last_updated: '2026-05-14'` are accepted.

## Where to dig deeper

- **Reference docs:** `docs/plan-tier-frontmatter.md`, `docs/knowledge-base-primitives.md`
- **Templates:** `templates/knowledge-base/{fact,incident-narrative,incident-facts,playbook-symptoms}.template.md`
- **CHANGELOG.md** for recent additions
- **README.md** for the full feature surface (long; scan, don't read top-to-bottom)
- **CLAUDE.md template** at `templates/claude/CLAUDE.md` — drop into your project root for an `.documentation/` quick-reference embedded in your CLAUDE.md
