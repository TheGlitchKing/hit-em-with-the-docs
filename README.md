# hit-em-with-the-docs

> Self-managing documentation system with hierarchical structure, intelligent automation, pattern discovery, and agent orchestration.

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue?logo=github)](https://github.com/marketplace/actions/hit-em-with-the-docs)
[![npm version](https://img.shields.io/npm/v/hit-em-with-the-docs.svg)](https://www.npmjs.com/package/hit-em-with-the-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Hierarchical Architecture**: 15-domain structure with 85% token reduction
- **22-Field Metadata System**: Comprehensive YAML frontmatter with auto-generation
- **Intelligent Automation**: Metadata sync, link checking, auditing, and maintenance
- **Pattern Discovery**: Extract coding patterns, anti-patterns, and standards from your codebase
- **Self-Healing**: Auto-detect and fix documentation issues
- **GitHub Action**: Automate documentation health checks in CI/CD
- **CLI Tool**: Full-featured command-line interface

## Quick Start

### GitHub Action

```yaml
name: Documentation Health Check

on:
  push:
    paths:
      - '.documentation/**'
  schedule:
    - cron: '0 16 * * 5'  # Weekly on Fridays

jobs:
  docs-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Documentation Health Check
        uses: username/hit-em-with-the-docs@v1
        with:
          command: maintain
          mode: quick
          fail-on-error: true

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: docs-health-report
          path: .documentation/reports/
```

### CLI Installation

```bash
# npm
npm install -g hit-em-with-the-docs

# Or use npx
npx hit-em-with-the-docs <command>
```

### Initialize Documentation

```bash
# Create .documentation structure with all 15 domains
npx hit-em-with-the-docs init
```

This creates:
```
.documentation/
├── INDEX.md           # Navigation hub
├── REGISTRY.md        # Quick reference
├── README.md          # Overview
├── security/          # Security domain
│   ├── INDEX.md
│   └── REGISTRY.md
├── api/               # API domain
├── devops/            # DevOps domain
├── database/          # Database domain
├── standards/         # Standards domain
└── ... (15 domains total)
```

## CLI Commands Reference

### `init` - Initialize Documentation Structure

**When to use**: First-time setup when starting documentation in a new project.

**What it does**: Creates the complete 15-domain hierarchical structure with INDEX/REGISTRY files.

```bash
# Initialize in current directory
hewtd init

# Initialize in specific path
hewtd init --path ./my-docs

# Choose template
hewtd init --template minimal
```

**Output**: Creates 53 files/directories including:
- Root INDEX.md, REGISTRY.md, README.md
- 15 domain folders (security, api, devops, etc.)
- Each domain gets INDEX.md + REGISTRY.md
- Empty reports/ and drafts/ folders

**Use cases**:
- Starting documentation from scratch
- Migrating from flat documentation structure
- Setting up new projects with best practices

---

### `maintain` - Full Documentation Maintenance

**When to use**: Weekly/monthly maintenance, pre-release checks, or after major documentation updates.

**What it does**: Runs complete maintenance workflow (metadata sync + link check + audit) and generates health report.

```bash
# Full maintenance (recommended weekly)
hewtd maintain

# Quick mode - skip link checking (faster for daily checks)
hewtd maintain --quick

# Auto-fix issues automatically
hewtd maintain --quick --fix

# Specific path
hewtd maintain --path ./docs
```

**Output**:
- Health score (0-100)
- Fixed metadata issues
- Broken link detection
- Audit compliance report
- Saved to `.documentation/reports/`

**Use cases**:
- Weekly documentation health checks
- Pre-release validation
- After adding multiple new documents
- CI/CD pipeline integration
- Preparing for documentation review

**Recommended schedule**:
- Daily: `hewtd maintain --quick` (fast check)
- Weekly: `hewtd maintain --quick --fix` (auto-fix issues)
- Monthly: `hewtd maintain --fix` (full with link checking)

---

### `integrate` - Auto-Classify and Place Documents

**When to use**: Adding existing documents to the hierarchical structure.

**What it does**: Analyzes content, detects appropriate domain, generates metadata, adds frontmatter, and moves file.

```bash
# Integrate a single document
hewtd integrate ./docs/my-guide.md

# Preview without changes
hewtd integrate ./docs/my-guide.md --dry-run

# Auto mode (no prompts)
hewtd integrate ./docs/my-guide.md --auto

# Force integration even with duplicates
hewtd integrate ./docs/my-guide.md --force
```

**What it analyzes**:
- Content keywords (security, API, testing, etc.)
- Document structure (guide, reference, example)
- Audience level (developers, admin)
- Automatically generates 22-field metadata

**Output**:
- Detected domain with confidence %
- Generated metadata (title, tier, domains, status)
- Target path in .documentation structure
- File moved with frontmatter added

**Use cases**:
- Migrating existing documentation
- Adding new guides without manual classification
- Organizing scattered documentation files
- Bulk import from legacy systems

**Example workflow**:
```bash
# Preview where documents will go
for file in docs/*.md; do
  hewtd integrate "$file" --dry-run
done

# If happy with classification, integrate them
for file in docs/*.md; do
  hewtd integrate "$file" --auto
done
```

---

### `metadata-sync` - Sync Metadata Across Documents

**When to use**: After manual edits, when metadata is missing, or for bulk metadata updates.

**What it does**: Validates, generates missing fields, calculates read times, and ensures consistency.

```bash
# Sync all metadata (dry-run by default)
hewtd metadata-sync

# Auto-fix missing fields
hewtd metadata-sync --fix

# Specific domain only
hewtd metadata-sync --domain security --fix

# Specific path
hewtd metadata-sync --path ./docs --fix
```

**Auto-generates**:
- `word_count` - Character analysis
- `estimated_read_time` - Based on word count
- `last_validated` - Current date
- Missing required fields with sensible defaults

**Validates**:
- Required fields present (title, tier, domains, status)
- Date formats (YYYY-MM-DD)
- Domain names match available domains
- Tier values (guide|standard|example|reference|admin)

**Use cases**:
- After bulk document edits
- Standardizing metadata across team
- Fixing validation errors
- Preparing for audits

---

### `link-check` - Validate Internal Links

**When to use**: Before releases, after restructuring, or monthly maintenance.

**What it does**: Checks all internal markdown links, detects broken references, and generates topology report.

```bash
# Check all links
hewtd link-check

# Specific domain
hewtd link-check --domain api

# Generate detailed link topology report
hewtd link-check --report

# Specific path
hewtd link-check --path ./docs
```

**Detects**:
- Broken internal links
- Links to non-existent files
- Case-sensitivity issues
- Cross-domain link patterns

**Output**:
- Total links checked
- Broken links with file locations
- Link topology (cross-domain relationships)
- Saved to `.documentation/reports/`

**Use cases**:
- Pre-release validation
- After renaming/moving files
- Monthly documentation health checks
- Detecting orphaned documents

---

### `audit` - Documentation Compliance Audit

**When to use**: Code reviews, quality gates, or establishing baselines.

**What it does**: Audits against naming conventions, file placement, metadata completeness, and best practices.

```bash
# Audit all documentation
hewtd audit

# Specific domain
hewtd audit --domain standards

# Show only failures
hewtd audit --issues-only

# Generate detailed audit report
hewtd audit --report
```

**Checks**:
- File naming conventions (kebab-case)
- Correct domain placement
- Metadata completeness (required fields)
- Tier appropriateness
- Frontmatter formatting

**Scoring**:
- Overall health score (0-100)
- Per-domain compliance %
- Metadata completeness %
- Naming compliance %

**Use cases**:
- Establishing documentation quality baseline
- Pre-merge validation in PRs
- Quarterly documentation reviews
- Compliance reporting

---

### `discover` - Pattern Discovery from Codebase

**When to use**: Documenting existing patterns, creating style guides, or architectural documentation.

**What it does**: Analyzes codebase to extract patterns, anti-patterns, standards, and dependencies.

```bash
# Discover coding patterns (singleton, factory, repository, etc.)
hewtd discover patterns

# Filter by language
hewtd discover patterns --language typescript

# Find anti-patterns and code smells
hewtd discover anti-patterns

# Extract implicit coding standards
hewtd discover standards

# Analyze package dependencies
hewtd discover dependencies

# Save to specific domain
hewtd discover patterns --output standards/
```

**Pattern types detected**:
- **Patterns**: Singleton, Factory, Repository, Service Layer, etc.
- **Anti-patterns**: God objects, circular dependencies, etc.
- **Standards**: Naming conventions, file organization, etc.
- **Dependencies**: Package usage, version patterns, etc.

**Output**: Markdown files with:
- Pattern name and description
- Code examples
- Occurrence count
- File locations
- Recommendations

**Use cases**:
- Creating architecture documentation from code
- Generating style guides automatically
- Onboarding documentation
- Technical debt identification
- Code review guidelines

---

### `list` - List All Domains

**When to use**: Quick reference, exploring structure, or scripting.

**What it does**: Displays all 15 domains with descriptions, categories, and priorities.

```bash
# List all domains
hewtd list

# JSON output for scripting
hewtd list --format json
```

**Output**: Table with:
- Domain name
- Category (core, features, development, advanced)
- Load priority (1-10, higher = more important)
- Description

**Use cases**:
- Learning the domain structure
- Deciding where to place new documentation
- Quick reference during writing
- Scripting and automation

---

### `search` - Search Documentation

**When to use**: Finding specific information, cross-referencing, or validating coverage.

**What it does**: Full-text search across all documentation with relevance ranking.

```bash
# Search all documentation
hewtd search "authentication"

# Search in specific domain
hewtd search "authentication" --domain security

# Case-sensitive search
hewtd search "Authentication" --case-sensitive

# Search in titles only
hewtd search "API" --titles-only
```

**Output**:
- Matching documents with relevance score
- Context snippets
- File paths
- Domain classification

**Use cases**:
- Finding existing documentation on a topic
- Checking for duplicate content
- Researching before writing new docs
- Validating documentation coverage

---

### `report` - Generate Reports

**When to use**: Dashboards, metrics, or stakeholder updates.

**What it does**: Generates comprehensive reports in markdown or JSON format.

```bash
# Health report (overall documentation health)
hewtd report health

# Audit report (compliance and issues)
hewtd report audit

# Link topology report
hewtd report links

# Export as JSON for dashboards
hewtd report health --format json
```

**Report types**:

**Health Report**:
- Overall health score
- Domain statistics
- Document counts per tier
- Metadata completeness
- Recent changes

**Audit Report**:
- Compliance by domain
- Critical issues
- Warnings
- Recommendations
- Historical trends

**Link Report**:
- Total links analyzed
- Broken links by file
- Cross-domain link patterns
- Link topology visualization
- Orphaned documents

**Use cases**:
- Weekly documentation metrics
- Stakeholder reporting
- Trend analysis
- Quality dashboards
- CI/CD reporting

---

## Common Workflows

### Daily Development
```bash
# Quick health check before committing
hewtd maintain --quick
```

### Adding New Documentation
```bash
# 1. Write your document
vim my-new-guide.md

# 2. Integrate it (auto-classifies and places)
hewtd integrate my-new-guide.md

# 3. Run quick check
hewtd maintain --quick --fix
```

### Weekly Maintenance
```bash
# Auto-fix all issues
hewtd maintain --quick --fix

# Review the report
cat .documentation/reports/maintenance-*.md
```

### Pre-Release Checklist
```bash
# 1. Full maintenance with link checking
hewtd maintain --fix

# 2. Generate health report
hewtd report health

# 3. Ensure health score > 80%
# 4. Review and commit
```

### Migrating Existing Docs
```bash
# 1. Initialize structure
hewtd init

# 2. Preview integration (dry-run)
for file in old-docs/*.md; do
  hewtd integrate "$file" --dry-run
done

# 3. Integrate all documents
for file in old-docs/*.md; do
  hewtd integrate "$file" --auto
done

# 4. Run full maintenance
hewtd maintain --fix

# 5. Review health score
hewtd report health
```

### Creating Architecture Docs from Code
```bash
# 1. Discover patterns
hewtd discover patterns

# 2. Extract standards
hewtd discover standards

# 3. Analyze dependencies
hewtd discover dependencies

# 4. Review generated docs in appropriate domains
cat .documentation/standards/*.md
cat .documentation/architecture/*.md
```

## Domain Structure

The system organizes documentation into 15 specialized domains:

| Domain | Description |
|--------|-------------|
| `security` | Security, auth, Vault, Keycloak, RLS |
| `devops` | Deployment, CI/CD, Docker, infrastructure |
| `database` | Schema, migrations, RLS, queries |
| `api` | API endpoints, routes, specifications |
| `standards` | Coding standards (backend, frontend, etc.) |
| `testing` | Test strategies, fixtures, patterns |
| `architecture` | System design, patterns, decisions |
| `features` | Feature implementation guides |
| `quickstart` | Setup guides, onboarding |
| `procedures` | Step-by-step operational procedures |
| `workflows` | Process documentation |
| `agents` | AI agent documentation |
| `backups` | Backup/restore guides |
| `troubleshooting` | Debug guides, common issues |
| `plans` | Planning documents, roadmaps |

## Metadata Schema (22 Fields)

Every document uses a comprehensive YAML frontmatter:

```yaml
---
# Core Identity (Required)
title: "Document Title"
tier: guide|standard|example|reference|admin
domains: [primary-domain, secondary-domain]
audience: [all|developers|devops|admin]
tags: [tag1, tag2]

# Status & Lifecycle (Required)
status: draft|active|deprecated|archived
last_updated: 'YYYY-MM-DD'
version: '1.0.0'

# Discovery & Navigation (Optional)
purpose: "One-sentence purpose"
related_docs:
  - path/to/related.md
load_priority: 1-10

# Ownership (Optional)
author: "Name"
maintainer: "Team"
review_frequency: monthly|quarterly|annually

# Implementation (Optional)
implementation_status: planned|in_progress|complete
tested: true|false
production_ready: true|false

# Auto-generated
estimated_read_time: "X minutes"
word_count: 1234
last_validated: 'YYYY-MM-DD'
backlinks: []
---
```

## GitHub Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `command` | Command to run | Yes | `maintain` |
| `mode` | Execution mode (quick/full/fix) | No | `quick` |
| `docs-path` | Path to documentation | No | `.documentation` |
| `domain` | Specific domain to operate on | No | - |
| `discover-type` | Discovery type | No | `patterns` |
| `fail-on-error` | Fail on critical errors | No | `false` |
| `fail-threshold` | Health score threshold | No | `50` |

## GitHub Action Outputs

| Output | Description |
|--------|-------------|
| `health-score` | Documentation health score (0-100) |
| `total-documents` | Total number of documentation files |
| `issues-found` | Number of issues found |
| `issues-fixed` | Number of issues auto-fixed |
| `broken-links` | Number of broken links |
| `metadata-compliance` | Percentage with complete metadata |
| `report-path` | Path to generated report |

## Configuration

Create `.hewtd.config.json` in your project root:

```json
{
  "docsPath": ".documentation",
  "domains": {
    "custom-domain": {
      "description": "Custom domain description",
      "keywords": ["keyword1", "keyword2"]
    }
  },
  "metadata": {
    "requiredFields": ["title", "tier", "domains", "status"],
    "autoGenerate": ["word_count", "estimated_read_time"]
  },
  "audit": {
    "namingConvention": "kebab-case",
    "maxFileSize": 50000
  },
  "discover": {
    "excludePaths": ["node_modules", "dist", "vendor"],
    "languages": ["typescript", "python", "go"]
  }
}
```

## Integration with Claude Code

This tool can be used as a Claude Code plugin. Add to your project:

```markdown
# .claude/CLAUDE.md

## Documentation System

Use hit-em-with-the-docs for documentation management:

- `/docs load <domain>` - Load domain documentation
- `/docs list` - List all domains
- `/docs search <query>` - Search documentation
- `/docs stats` - Show statistics
- `/docs maintain` - Run maintenance
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT - see [LICENSE](LICENSE) for details.
