# Documentation System Plugin (hit-em-with-the-docs)

This project uses the hit-em-with-the-docs documentation system for hierarchical, self-managing documentation.

## Quick Reference

### Documentation Structure

```
.documentation/
├── INDEX.md           # Navigation hub
├── REGISTRY.md        # Quick reference
├── security/          # Security, auth, Vault, Keycloak
├── devops/            # Deployment, CI/CD, Docker
├── database/          # Schema, migrations, RLS
├── api/               # API endpoints, routes
├── standards/         # Coding standards
├── testing/           # Test strategies
├── architecture/      # System design
├── features/          # Feature guides
├── quickstart/        # Setup guides
├── procedures/        # Operational procedures
├── workflows/         # Process documentation
├── agents/            # AI agent docs
├── backups/           # Backup guides
├── troubleshooting/   # Debug guides
└── plans/             # Planning documents
```

These 15 domains are built-in and always present. The set is **extensible** — register project-specific domains at runtime with `npx hit-em-with-the-docs domain add <id> -k <keywords>` (stored in `.claude/hit-em-with-the-docs.json` under `domains: []`, and scaffolded under `.documentation/<id>/`). Run `npx hit-em-with-the-docs domain list` to see the active set, and `domain remove <id>` to drop a custom one (never deletes docs).

**Deprecated docs → `.documentation/archive/`.** To retire a doc without deleting it, use `npx hit-em-with-the-docs archive <file>` — it moves the doc under `archive/`, stamps lifecycle frontmatter (`archived_from` makes it reversible), and reindexes. A link guard refuses if active docs still link to it (`--force` overrides); `--dry-run` previews. `unarchive <file>` restores it where it came from, and `archive-candidates` lists docs that may warrant archiving (advisory, read-only — never moves anything). hewtd excludes the `archive/` folder from every scan (audit, link-check, metadata-sync, integrate, link graph, search), so archived docs are never validated or indexed. `archive` is reserved and cannot be a domain. A doc left at `status: deprecated` in an active folder is now surfaced by `audit` as an INFO nudge toward `archive`.

## Commands

### /docs

Documentation commands for managing the hierarchical documentation system.

#### /docs load <domain>

Load documentation for a specific domain.

Usage: `/docs load security`

This loads:
1. Domain INDEX.md (complete listing)
2. Domain REGISTRY.md (quick reference)
3. Key documents summary

#### /docs list

List all documentation domains (the 15 built-in plus any custom domains) with descriptions.

#### /docs search <query>

Search across all documentation for a query term.

Usage: `/docs search "authentication"`

#### /docs stats

Show documentation health statistics including:
- Total documents per domain
- Link health
- Metadata compliance
- Recent updates

#### /docs maintain

Run documentation maintenance:
```bash
npx hit-em-with-the-docs maintain --quick
```

#### /docs integrate <file>

Integrate a document into the system:
```bash
npx hit-em-with-the-docs integrate ./docs/new-guide.md
```

### /discover

Pattern discovery commands for extracting patterns from the codebase.

#### /discover patterns

Discover coding patterns in the codebase:
```bash
npx hit-em-with-the-docs discover patterns
```

Detects: Service layer, Repository pattern, Factory pattern, Error handling, etc.

#### /discover anti-patterns

Detect anti-patterns and code smells:
```bash
npx hit-em-with-the-docs discover anti-patterns
```

Detects: Hardcoded credentials, SQL injection risks, console.log, any types, etc.

#### /discover standards

Extract implicit coding standards:
```bash
npx hit-em-with-the-docs discover standards
```

Extracts: Naming conventions, file organization, code style, documentation coverage.

#### /discover dependencies

Analyze project dependencies:
```bash
npx hit-em-with-the-docs discover dependencies
```

Analyzes: Package versions, circular dependencies, unused dependencies, security issues.

## Metadata Schema

Every documentation file should have this YAML frontmatter:

```yaml
---
# Required fields
title: "Document Title"
tier: guide|standard|example|reference|admin
domains: [primary-domain]
status: draft|active|deprecated|archived
last_updated: 'YYYY-MM-DD'
version: '1.0.0'

# Optional fields
audience: [all|developers|devops|admin]
tags: [tag1, tag2]
purpose: "One-sentence purpose"
related_docs:
  - path/to/related.md
author: "Name"
---
```

## Tiers

| Tier | Description | Size |
|------|-------------|------|
| guide | Step-by-step how-to guides | 15-30 KB |
| standard | Coding standards and conventions | 5-15 KB |
| example | Code examples and templates | 3-10 KB |
| reference | Comprehensive references | 30+ KB |
| admin | Administrative/operational docs | 10-20 KB |

## Workflow Guidelines

### Adding New Documentation

1. Determine the appropriate domain
2. Create file with kebab-case naming: `topic-name-type.md`
3. Add required frontmatter
4. Write content following tier template
5. Run: `npx hit-em-with-the-docs integrate <file>`

### Weekly Maintenance

Run every Friday:
```bash
npx hit-em-with-the-docs maintain
```

This syncs metadata, checks links, and audits compliance.

### Before Committing Documentation

```bash
# Quick check
npx hit-em-with-the-docs audit

# Fix issues
npx hit-em-with-the-docs metadata-sync --fix
```

## File Naming Convention

- Use kebab-case: `api-design-standards.md`
- Include type suffix when appropriate: `-guide.md`, `-standard.md`, `-procedure.md`
- Be specific: `keycloak-integration-guide.md` not `auth.md`

## Related Commands

```bash
# Initialize documentation structure
npx hit-em-with-the-docs init

# Generate reports
npx hit-em-with-the-docs report health
npx hit-em-with-the-docs report audit
npx hit-em-with-the-docs report links

# Check links
npx hit-em-with-the-docs link-check

# Discover patterns
npx hit-em-with-the-docs discover patterns --language typescript
```
