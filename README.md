# hit-em-with-the-docs

> A self-managing documentation system that keeps your docs organized, accurate, and easy to find.

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue?logo=github)](https://github.com/marketplace/actions/hit-em-with-the-docs)
[![npm version](https://img.shields.io/npm/v/hit-em-with-the-docs.svg)](https://www.npmjs.com/package/hit-em-with-the-docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


> [!IMPORTANT]
> You will still need to  remember to invoke this plugin for document creation! As projects continue to scale, documetnation will need to be created / maintained. a user will still need to invoke this plugin or ask and LLM for that documentation to be created for your > feature / workflow / infrastructure, or create it yourself using the commands from this plugin. This plugin needs to be invoked to either create / update / maintain it all. 



## Summary

Documentation often becomes messy and hard to find as projects grow. Important information gets scattered across many files, links break when files move, and nobody knows if docs are up to date. Hit-em-with-the-docs solves these problems by organizing your documentation into 15 clear categories, checking links automatically, and making sure every document has proper information about what it contains. It keeps your documentation healthy without you having to think about it.

## Operational Summary

The plugin creates a special folder called `.documentation` in your project with 15 organized sections (called "domains") like security, API, database, and testing. Each document gets tagged with metadata - information like title, category, and last update date - that helps you and the system understand what it's about.

The system has built-in tools that automatically check your documentation for problems. It finds broken links between documents, makes sure metadata is complete, and verifies files are named correctly. You can run these checks manually or set them up to run automatically in your build process. The plugin can also scan your actual code to discover patterns and create documentation from what it finds. Everything is designed to work with markdown files and integrates seamlessly with GitHub Actions for continuous monitoring.

## Features

- **Organized Structure**: Automatically creates 15 specialized categories for different types of documentation
- **Smart Classification**: Analyzes your documents and automatically puts them in the right category
- **Metadata Management**: Tracks 22 different pieces of information about each document (title, status, tags, etc.)
- **Link Checking**: Finds and reports broken links between documents
- **Auto-Fixing**: Can automatically repair common problems like missing metadata
- **Pattern Discovery**: Scans your code to find and document coding patterns
- **Health Reports**: Generates reports showing the overall quality of your documentation
- **GitHub Integration**: Works as a GitHub Action for automated checks
- **CLI Tool**: Full command-line interface for all operations
- **Search Functionality**: Quick search across all documentation

## Quick Start

### Installation Methods

#### Method 1: Global Installation (Recommended for CLI use)

This method installs the tool on your computer so you can use it anywhere.

1. Open your terminal or command prompt
2. Type this command and press Enter:
   ```bash
   npm install -g hit-em-with-the-docs
   ```
3. Wait for the installation to complete
4. Verify it worked by typing:
   ```bash
   hewtd --version
   ```
5. You should see the version number

#### Method 2: Project Installation

This method installs the tool only for your current project.

1. Open your terminal in your project folder
2. Type this command:
   ```bash
   npm install --save-dev hit-em-with-the-docs
   ```
3. Add a script to your `package.json`:
   ```json
   "scripts": {
     "docs": "hewtd"
   }
   ```
4. Use it with: `npm run docs`

#### Method 3: One-Time Use (No Installation)

You can run the tool without installing it using `npx`:

```bash
npx hit-em-with-the-docs <command>
```

#### Method 4: GitHub Action

Add this to your repository at `.github/workflows/docs-check.yml`:

```yaml
name: Documentation Health Check

on:
  push:
    paths:
      - '.documentation/**'
  schedule:
    - cron: '0 16 * * 5'  # Every Friday at 4 PM

jobs:
  docs-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Documentation Health Check
        uses: TheGlitchKing/hit-em-with-the-docs@v1
        with:
          command: maintain
          mode: quick
          fail-on-error: true
```

### Initializing the Plugin

After installing, you need to create the documentation structure:

```bash
# Create .documentation folder with all 15 categories
hewtd init

# Or specify a different location
hewtd init --path ./docs
```

This creates a folder structure like:
```
.documentation/
├── INDEX.md           # Main navigation page
├── REGISTRY.md        # Quick reference list
├── README.md          # Overview of the documentation
├── security/          # Security-related docs
├── api/               # API documentation
├── database/          # Database docs
├── testing/           # Test documentation
└── ... (11 more categories)
```

---

## CLI Commands

### Basic Commands

| Command | Description |
|---------|-------------|
| `hewtd init` | Create the documentation structure |
| `hewtd maintain` | Run full health check and maintenance |
| `hewtd integrate <file>` | Add a document to the system |
| `hewtd list` | Show all documentation categories |
| `hewtd search <query>` | Search for content in documentation |

### Maintenance Commands

| Command | Description |
|---------|-------------|
| `hewtd metadata-sync` | Update and fix document metadata |
| `hewtd link-check` | Find broken links |
| `hewtd audit` | Check documentation quality |
| `hewtd report <type>` | Generate reports (health, audit, links) |

### Discovery Commands

| Command | Description |
|---------|-------------|
| `hewtd discover patterns` | Find coding patterns in your codebase |
| `hewtd discover anti-patterns` | Find problematic code patterns |
| `hewtd discover standards` | Extract coding standards from code |
| `hewtd discover dependencies` | Analyze project dependencies |

---

### Command Details and Examples

#### `hewtd init` - Create Documentation Structure

**When to use**: First time setting up documentation in a project.

**What it does**: Creates the `.documentation` folder with 15 organized categories and starter files.

**Examples**:
```bash
# Basic initialization
hewtd init

# Custom location
hewtd init --path ./my-docs

# Overwrite existing structure
hewtd init --force
```

**What to expect**: You'll see 53 files and folders created. Each category gets an INDEX.md (table of contents) and REGISTRY.md (quick reference list).

---

#### `hewtd maintain` - Full Documentation Maintenance

**When to use**: Weekly checkups, before releases, or after adding lots of documentation.

**What it does**: Runs a complete health check - fixes metadata, checks links, and creates a report with a score.

**Examples**:
```bash
# Full maintenance (checks everything)
hewtd maintain

# Quick mode (skips link checking - faster)
hewtd maintain --quick

# Quick mode with auto-fix
hewtd maintain --quick --fix

# Specific folder
hewtd maintain --path ./docs
```

**What to expect**:
- See a health score from 0 to 100
- Get a list of issues found
- See how many issues were fixed
- Find a detailed report in `.documentation/reports/`

**Use it on**: Your entire documentation folder, especially before merging code or releasing.

---

#### `hewtd integrate` - Add Documents to the System

**When to use**: Adding new documentation files or organizing existing ones.

**What it does**: Reads your document, figures out which category it belongs in, adds metadata, and moves it to the right place.

**Examples**:
```bash
# Add a single document
hewtd integrate ./my-guide.md

# Preview where it would go (doesn't actually move it)
hewtd integrate ./my-guide.md --dry-run

# Automatic mode (no questions asked)
hewtd integrate ./my-guide.md --auto

# Add multiple documents
for file in old-docs/*.md; do
  hewtd integrate "$file" --auto
done
```

**What to expect**: The tool will read your document and suggest a category like "security" or "api" based on its content. It adds metadata and moves the file.

**Use it on**: New markdown files you want to add to your documentation system.

---

#### `hewtd metadata-sync` - Update Document Information

**When to use**: After manually editing files or when metadata is missing.

**What it does**: Checks all documents for proper metadata and fills in missing information automatically.

**Examples**:
```bash
# Check everything (preview only)
hewtd metadata-sync

# Fix all issues
hewtd metadata-sync --fix

# Only check security documentation
hewtd metadata-sync --domain security --fix
```

**What to expect**: Sees how many documents have complete information, automatically adds things like word count and reading time.

**Use it on**: The entire `.documentation` folder or specific categories.

---

#### `hewtd link-check` - Find Broken Links

**When to use**: Before releases, after moving files, or monthly maintenance.

**What it does**: Checks every link in your documentation to make sure it points to a real file.

**Examples**:
```bash
# Check all links
hewtd link-check

# Check specific category
hewtd link-check --domain api

# Generate detailed report
hewtd link-check --report
```

**What to expect**: See a list of broken links with file names and line numbers. The report saves to `.documentation/reports/`.

**Use it on**: Your entire documentation, especially after reorganizing files.

---

#### `hewtd audit` - Check Documentation Quality

**When to use**: Quality checks, code reviews, or establishing a baseline.

**What it does**: Checks if files follow naming rules, are in the right categories, and have complete metadata.

**Examples**:
```bash
# Audit everything
hewtd audit

# Only show problems
hewtd audit --issues-only

# Audit specific category
hewtd audit --domain standards

# Generate full report
hewtd audit --report
```

**What to expect**: Get a quality score and detailed list of what needs fixing.

**Use it on**: The entire documentation system to measure quality.

---

#### `hewtd discover patterns` - Find Code Patterns

**When to use**: Creating architecture documentation, onboarding guides, or style guides.

**What it does**: Scans your code and creates documentation about patterns it finds (like Singleton, Factory, Repository).

**Examples**:
```bash
# Find all patterns
hewtd discover patterns

# Only TypeScript files
hewtd discover patterns --language typescript

# Scan specific folder
hewtd discover patterns --root ./src
```

**What to expect**: Creates markdown files with examples of patterns found in your code, including file locations.

**Use it on**: Your source code folders (automatically skips node_modules and other common folders).

---

#### `hewtd list` - Show All Categories

**When to use**: Quick reference to see available categories.

**What it does**: Displays all 15 categories with descriptions.

**Example**:
```bash
hewtd list
```

**What to expect**: A table showing category names, priority, and descriptions.

---

#### `hewtd search` - Find Documentation

**When to use**: Looking for specific information across all docs.

**What it does**: Searches through all documentation files for your search term.

**Examples**:
```bash
# Basic search
hewtd search "authentication"

# Search in specific category
hewtd search "authentication" --domain security
```

**What to expect**: List of files containing your search term, sorted by relevance.

**Use it on**: Any topic you need to find in your documentation.

---

#### `hewtd report` - Generate Reports

**When to use**: Weekly metrics, stakeholder updates, or dashboards.

**What it does**: Creates comprehensive reports in markdown or JSON format.

**Examples**:
```bash
# Health report
hewtd report health

# Audit report
hewtd report audit

# Link topology report
hewtd report links

# JSON output for automation
hewtd report health --format json
```

**What to expect**: Detailed report saved to `.documentation/reports/` with scores, statistics, and recommendations.

**Use it on**: Your documentation system to get metrics and trends.

---

## Claude Code Integration

This tool works as a Claude Code plugin to help Claude understand and work with your documentation.

### Available Claude Commands

These commands can be used in conversation with Claude when the plugin is installed:

| Command | Description |
|---------|-------------|
| `/docs load <domain>` | Load a specific category of documentation |
| `/docs list` | Show all documentation categories |
| `/docs search <query>` | Search through documentation |
| `/docs stats` | Display documentation statistics |
| `/docs maintain` | Run maintenance checks |

### Setting Up Claude Integration

Create or update `.claude/CLAUDE.md` in your project:

```markdown
# Documentation System

This project uses hit-em-with-the-docs for documentation management.

## Available Documentation Commands

- `/docs load <domain>` - Load specific documentation domain
- `/docs list` - List all available domains
- `/docs search <query>` - Search documentation
- `/docs stats` - Show documentation statistics
- `/docs maintain` - Run documentation maintenance

## Documentation Structure

Documentation is organized into 15 domains:
- security: Authentication, authorization, security practices
- api: API endpoints and specifications
- database: Database schema and queries
- testing: Test strategies and patterns
- And 11 more specialized categories
```

### How to Use with Claude

**Loading documentation**:
```
You: /docs load security
Claude: [Loads all security-related documentation and can answer questions about it]
```

**Searching documentation**:
```
You: /docs search authentication
Claude: [Shows files containing "authentication"]
```

**Getting statistics**:
```
You: /docs stats
Claude: [Shows health score, document counts, recent updates]
```

**Running maintenance**:
```
You: /docs maintain
Claude: [Runs health check and reports issues]
```

**When to use these commands**:
- Use `/docs load` when asking Claude questions about specific topics
- Use `/docs search` to find existing documentation before writing new content
- Use `/docs stats` to check documentation health
- Use `/docs maintain` before committing changes

**What to expect**: Claude will have full context of your documentation and can answer questions, suggest improvements, or help maintain it.

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

# 2. Add it to the system
hewtd integrate my-new-guide.md

# 3. Quick check
hewtd maintain --quick --fix
```

### Weekly Maintenance
```bash
# Auto-fix all issues
hewtd maintain --quick --fix

# Review the report
cat .documentation/reports/maintenance-*.md
```

### Before Releasing
```bash
# 1. Full maintenance with link checking
hewtd maintain --fix

# 2. Generate health report
hewtd report health

# 3. Make sure score is above 80
# 4. Commit changes
```

### Migrating Existing Documentation
```bash
# 1. Create structure
hewtd init

# 2. Preview where files will go
for file in old-docs/*.md; do
  hewtd integrate "$file" --dry-run
done

# 3. Integrate all files
for file in old-docs/*.md; do
  hewtd integrate "$file" --auto
done

# 4. Run maintenance
hewtd maintain --fix

# 5. Check results
hewtd report health
```

---

## Technical Details

### Architecture Overview

The system is built with TypeScript and organized into several core modules:

```
src/
├── cli/              # Command-line interface
├── core/
│   ├── audit/        # Documentation quality auditing
│   ├── discover/     # Code pattern discovery
│   ├── domains/      # Domain classification system
│   ├── integrate/    # Document integration
│   ├── links/        # Link checking and tracking
│   ├── maintain/     # Maintenance orchestration
│   └── metadata/     # Metadata management
├── generators/       # Scaffold and template generation
├── reports/          # Report generation
└── utils/            # Shared utilities
```

### File Structure

**Root Documentation Files**:
- `INDEX.md` - Main navigation hub with links to all domains
- `REGISTRY.md` - Quick reference list of all documents
- `README.md` - Overview and getting started guide

**Domain Structure**:
Each of the 15 domains follows this pattern:
```
domain-name/
├── INDEX.md          # Domain table of contents
├── REGISTRY.md       # Quick reference for this domain
└── *.md              # Individual documentation files
```

**Generated Files**:
```
.documentation/
├── reports/          # Health, audit, and link reports
│   ├── maintenance-YYYYMMDD-HHMMSS.md
│   ├── audit-YYYYMMDD-HHMMSS.md
│   └── links-YYYYMMDD-HHMMSS.md
└── drafts/           # Work-in-progress documents
```

### Domain System

The system organizes documentation into 15 specialized domains:

| Domain | Category | Priority | Description |
|--------|----------|----------|-------------|
| `standards` | development | 10 | Coding standards and conventions |
| `security` | core | 9 | Security, auth, encryption |
| `quickstart` | features | 9 | Setup and onboarding |
| `devops` | core | 8 | Deployment and infrastructure |
| `database` | core | 8 | Schema and queries |
| `api` | core | 8 | API endpoints and specs |
| `testing` | development | 7 | Test strategies and patterns |
| `architecture` | development | 7 | System design and patterns |
| `features` | features | 6 | Feature implementation guides |
| `procedures` | features | 6 | Step-by-step operations |
| `troubleshooting` | advanced | 6 | Debug guides and solutions |
| `workflows` | features | 5 | Process documentation |
| `agents` | advanced | 5 | AI agent documentation |
| `backups` | advanced | 4 | Backup and recovery |
| `plans` | advanced | 3 | Planning and roadmaps |

**Priority System**: Domains with higher priority (1-10 scale) are loaded first by Claude Code and other integrations.

**Categories**:
- `core`: Essential project infrastructure
- `development`: Development practices and patterns
- `features`: Feature-specific documentation
- `advanced`: Specialized or less-frequently accessed

### Metadata Schema

Every document includes YAML frontmatter with up to 22 fields:

**Required Fields**:
```yaml
title: "Document Title"
tier: guide|standard|example|reference|admin
domains: [primary-domain, secondary-domain]
status: draft|active|deprecated|archived
```

**Auto-Generated Fields**:
```yaml
word_count: 1234                    # Calculated from content
estimated_read_time: "5 minutes"    # Based on 200 words/minute
last_validated: '2024-01-15'        # Date of last metadata sync
```

**Optional Fields**:
```yaml
# Discovery
purpose: "One-sentence description"
tags: [tag1, tag2, tag3]
audience: [developers|devops|admin|all]
related_docs: [./other-doc.md]

# Lifecycle
last_updated: '2024-01-15'
version: '1.0.0'
review_frequency: monthly|quarterly|annually

# Ownership
author: "Name"
maintainer: "Team Name"

# Implementation
implementation_status: planned|in_progress|complete
tested: true|false
production_ready: true|false
load_priority: 1-10
backlinks: []  # Auto-generated by link checker
```

### Classification Algorithm

The domain classifier uses keyword-based scoring with Levenshtein distance:

1. **Keyword Matching** (`src/core/domains/classifier.ts`):
   - Extracts words from document title and content
   - Scores each domain based on keyword matches
   - Uses weighted scoring (title matches count more)

2. **Fuzzy Matching**:
   - Uses Levenshtein distance for similar words
   - Catches variations (e.g., "authenticate" matches "authentication")
   - Configurable similarity threshold

3. **Confidence Scoring**:
   - Returns confidence percentage for each domain
   - Suggests top 3 matches
   - Falls back to user selection if confidence is low

### Link Tracking

The link checker (`src/core/links/checker.ts`) maintains a topology map:

- Parses markdown links in all documents
- Resolves relative paths
- Tracks cross-domain references
- Builds backlink map
- Detects broken links and orphaned documents

### Maintenance Orchestrator

The maintenance system (`src/core/maintain/orchestrator.ts`) coordinates:

1. **Metadata Sync**: Updates frontmatter across all documents
2. **Link Check**: Validates internal links (optional in quick mode)
3. **Audit**: Checks naming conventions and file placement
4. **Report Generation**: Creates health score and detailed report

Health score calculation:
- Metadata completeness: 40%
- Link health: 30%
- Naming compliance: 20%
- File placement accuracy: 10%

### GitHub Action

The action (`src/action/index.ts`) wraps the CLI for GitHub workflows:

**Inputs**:
- `command`: CLI command to run
- `mode`: Execution mode (quick/full/fix)
- `docs-path`: Path to documentation
- `domain`: Specific domain filter
- `fail-on-error`: Exit code behavior
- `fail-threshold`: Minimum health score

**Outputs**:
- `health-score`: Overall quality (0-100)
- `total-documents`: Document count
- `issues-found`: Problem count
- `issues-fixed`: Auto-fixed count
- `broken-links`: Broken link count
- `metadata-compliance`: Metadata completeness %
- `report-path`: Generated report location

### Edge Cases and Handling

**Duplicate Documents**:
- Detected during integration
- User prompted to merge or keep separate
- Can force integration with `--force` flag

**Missing Metadata**:
- Auto-generated with sensible defaults
- Required fields must be provided
- Validation prevents invalid values

**Circular Links**:
- Detected but not flagged as errors
- Logged in link topology report
- Useful for navigation structures

**Large Files**:
- Configurable size limit (default: 50KB)
- Warning for oversized documents
- Suggest splitting into multiple files

**Non-Standard Domains**:
- Custom domains via configuration
- Must include keywords and description
- Integrated into classification system

**Empty Documents**:
- Flagged in audit
- Not counted in health score
- Suggested for removal or completion

### Configuration

Create `.hewtd.config.json` for customization:

```json
{
  "docsPath": ".documentation",
  "domains": {
    "custom-domain": {
      "description": "Custom domain description",
      "keywords": ["keyword1", "keyword2"],
      "loadPriority": 5,
      "category": "features"
    }
  },
  "metadata": {
    "requiredFields": ["title", "tier", "domains", "status"],
    "autoGenerate": ["word_count", "estimated_read_time", "last_validated"]
  },
  "audit": {
    "namingConvention": "kebab-case",
    "maxFileSize": 50000,
    "allowedTiers": ["guide", "standard", "example", "reference", "admin"]
  },
  "discover": {
    "excludePaths": ["node_modules", "dist", "vendor", ".git"],
    "languages": ["typescript", "javascript", "python", "go"],
    "patterns": {
      "enabled": true,
      "minOccurrences": 2
    }
  },
  "links": {
    "checkExternal": false,
    "ignorePatterns": ["http://localhost", "*.example.com"]
  },
  "reports": {
    "outputPath": ".documentation/reports",
    "format": "markdown",
    "includeTimestamp": true
  }
}
```

### Performance Considerations

**Large Repositories**:
- Uses streaming for file reads
- Parallel processing where possible
- Configurable concurrency limits
- Quick mode skips expensive operations

**Memory Usage**:
- Metadata cached in memory during operations
- Link topology built incrementally
- Reports streamed to disk

**CI/CD Optimization**:
- Quick mode recommended for frequent checks
- Full mode for scheduled/release checks
- Use `fail-threshold` to allow gradual improvement

---

## Requirements

- Node.js >= 20.0.0
- npm or yarn
- Git (for GitHub Action)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:
- Setting up development environment
- Running tests
- Code style guidelines
- Submitting pull requests

## License

MIT - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/TheGlitchKing/hit-em-with-the-docs/issues)
- **Discussions**: [GitHub Discussions](https://github.com/TheGlitchKing/hit-em-with-the-docs/discussions)
- **Documentation**: This README and `.documentation/` in your project

## Changelog

See [releases](https://github.com/TheGlitchKing/hit-em-with-the-docs/releases) for version history and changes.
