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

## Commands

### Maintenance

```bash
# Run full maintenance (metadata sync + link check + audit)
npx hit-em-with-the-docs maintain

# Quick mode (skip link checking)
npx hit-em-with-the-docs maintain --quick

# Auto-fix mode
npx hit-em-with-the-docs maintain --fix
```

### Metadata

```bash
# Sync metadata across all documents
npx hit-em-with-the-docs metadata-sync

# Dry-run (preview changes)
npx hit-em-with-the-docs metadata-sync --dry-run

# Auto-fix missing fields
npx hit-em-with-the-docs metadata-sync --fix
```

### Link Checking

```bash
# Check all internal links
npx hit-em-with-the-docs link-check

# Check specific domain
npx hit-em-with-the-docs link-check --domain security

# Generate detailed report
npx hit-em-with-the-docs link-check --report
```

### Auditing

```bash
# Audit all documentation
npx hit-em-with-the-docs audit

# Audit specific domain
npx hit-em-with-the-docs audit --domain standards

# Show only issues
npx hit-em-with-the-docs audit --issues-only
```

### Integration

```bash
# Integrate a rogue document into the system
npx hit-em-with-the-docs integrate ./docs/new-guide.md

# Auto mode (no prompts)
npx hit-em-with-the-docs integrate ./docs/new-guide.md --auto

# Dry-run
npx hit-em-with-the-docs integrate ./docs/new-guide.md --dry-run
```

### Pattern Discovery

```bash
# Discover coding patterns
npx hit-em-with-the-docs discover patterns

# Filter by language
npx hit-em-with-the-docs discover patterns --language typescript

# Detect anti-patterns
npx hit-em-with-the-docs discover anti-patterns

# Extract implicit standards
npx hit-em-with-the-docs discover standards

# Analyze dependencies
npx hit-em-with-the-docs discover dependencies
```

### Other Commands

```bash
# List all domains
npx hit-em-with-the-docs list

# Search documentation
npx hit-em-with-the-docs search "authentication"

# Generate reports
npx hit-em-with-the-docs report health
npx hit-em-with-the-docs report audit
npx hit-em-with-the-docs report links
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
