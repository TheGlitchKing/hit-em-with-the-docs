import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { DOMAINS, DOMAIN_DEFINITIONS, type Domain } from '../core/domains/constants.js';
import { generateRootIndex } from './index-generator.js';
import { generateRootRegistry } from './registry-generator.js';
import { generateDomainIndex } from './templates/domain-index.js';
import { generateDomainRegistry } from './templates/domain-registry.js';
import { logger } from '../utils/logger.js';
import { pathExists } from '../utils/glob.js';

export interface ScaffoldOptions {
  rootPath: string;
  overwrite?: boolean;
  domains?: Domain[];
  silent?: boolean;
}

export interface ScaffoldResult {
  success: boolean;
  created: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Create the complete documentation scaffold
 */
export async function createScaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const {
    rootPath,
    overwrite = false,
    domains = [...DOMAINS],
    silent = false,
  } = options;

  const result: ScaffoldResult = {
    success: true,
    created: [],
    skipped: [],
    errors: [],
  };

  if (!silent) {
    logger.header('Creating Documentation Scaffold');
    logger.info(`Root path: ${rootPath}`);
    logger.info(`Domains: ${domains.length}`);
  }

  try {
    // Create root directory
    await createDirectory(rootPath, result, overwrite);

    // Create root files
    await createRootFiles(rootPath, result, overwrite);

    // Create domain directories and files
    for (const domain of domains) {
      await createDomainStructure(rootPath, domain, result, overwrite);
    }

    // Create special directories
    await createSpecialDirectories(rootPath, result, overwrite);

    if (!silent) {
      logger.newline();
      logger.success(`Scaffold created successfully!`);
      logger.info(`Created: ${result.created.length} files/directories`);
      if (result.skipped.length > 0) {
        logger.warn(`Skipped: ${result.skipped.length} (already exist)`);
      }
    }
  } catch (error) {
    result.success = false;
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    if (!silent) {
      logger.error(`Failed to create scaffold: ${message}`);
    }
  }

  return result;
}

/**
 * Create a directory if it doesn't exist
 */
async function createDirectory(
  path: string,
  result: ScaffoldResult,
  overwrite: boolean
): Promise<void> {
  const exists = await pathExists(path);

  if (exists && !overwrite) {
    result.skipped.push(path);
    return;
  }

  await mkdir(path, { recursive: true });
  result.created.push(path);
}

/**
 * Create a file if it doesn't exist
 */
async function createFile(
  path: string,
  content: string,
  result: ScaffoldResult,
  overwrite: boolean
): Promise<void> {
  const exists = await pathExists(path);

  if (exists && !overwrite) {
    result.skipped.push(path);
    return;
  }

  await writeFile(path, content, 'utf-8');
  result.created.push(path);
}

/**
 * Create root-level files
 */
async function createRootFiles(
  rootPath: string,
  result: ScaffoldResult,
  overwrite: boolean
): Promise<void> {
  // INDEX.md
  const indexContent = generateRootIndex();
  await createFile(join(rootPath, 'INDEX.md'), indexContent, result, overwrite);

  // REGISTRY.md
  const registryContent = generateRootRegistry();
  await createFile(join(rootPath, 'REGISTRY.md'), registryContent, result, overwrite);

  // README.md
  const readmeContent = generateRootReadme();
  await createFile(join(rootPath, 'README.md'), readmeContent, result, overwrite);
}

/**
 * Create domain directory structure
 */
async function createDomainStructure(
  rootPath: string,
  domain: Domain,
  result: ScaffoldResult,
  overwrite: boolean
): Promise<void> {
  const domainPath = join(rootPath, domain);
  const def = DOMAIN_DEFINITIONS[domain];

  // Create domain directory
  await createDirectory(domainPath, result, overwrite);

  // Create INDEX.md
  const indexContent = generateDomainIndex(domain, def);
  await createFile(join(domainPath, 'INDEX.md'), indexContent, result, overwrite);

  // Create REGISTRY.md
  const registryContent = generateDomainRegistry(domain, def);
  await createFile(join(domainPath, 'REGISTRY.md'), registryContent, result, overwrite);
}

/**
 * Create special directories (drafts, reports)
 */
async function createSpecialDirectories(
  rootPath: string,
  result: ScaffoldResult,
  overwrite: boolean
): Promise<void> {
  // Drafts directory
  await createDirectory(join(rootPath, 'drafts'), result, overwrite);

  // Reports directory
  await createDirectory(join(rootPath, 'reports'), result, overwrite);

  // Create .gitkeep files to preserve empty directories
  await createFile(
    join(rootPath, 'drafts', '.gitkeep'),
    '# This file ensures the drafts directory is tracked by git\n',
    result,
    overwrite
  );

  await createFile(
    join(rootPath, 'reports', '.gitkeep'),
    '# This file ensures the reports directory is tracked by git\n',
    result,
    overwrite
  );
}

/**
 * Generate root README content
 */
function generateRootReadme(): string {
  return `# Documentation

This documentation system uses a hierarchical 15-domain structure for optimal organization and discoverability.

## Quick Navigation

- **[INDEX.md](INDEX.md)** - Complete document listing with metadata
- **[REGISTRY.md](REGISTRY.md)** - Quick reference tables

## Domains

| Domain | Description |
|--------|-------------|
${DOMAINS.map((d) => `| [${d}](${d}/) | ${DOMAIN_DEFINITIONS[d].description} |`).join('\n')}

## Adding New Documentation

1. Identify the correct domain for your document
2. Create the file in the domain directory
3. Add YAML frontmatter with required metadata
4. Run \`npx hit-em-with-the-docs integrate <file>\` to register

## Metadata Schema

Every document should include:

\`\`\`yaml
---
title: "Document Title"
tier: guide|standard|example|reference|admin
domains: [primary-domain]
status: draft|active|deprecated|archived
last_updated: 'YYYY-MM-DD'
version: '1.0.0'
---
\`\`\`

## Maintenance

Run weekly maintenance with:

\`\`\`bash
npx hit-em-with-the-docs maintain
\`\`\`

This will:
- Sync metadata across all documents
- Check for broken links
- Audit compliance
- Generate health reports
`;
}

/**
 * Check if scaffold already exists
 */
export async function scaffoldExists(rootPath: string): Promise<boolean> {
  const indexPath = join(rootPath, 'INDEX.md');
  return pathExists(indexPath);
}

/**
 * Get scaffold status
 */
export async function getScaffoldStatus(rootPath: string): Promise<{
  exists: boolean;
  domains: Domain[];
  missingDomains: Domain[];
}> {
  const exists = await scaffoldExists(rootPath);

  if (!exists) {
    return {
      exists: false,
      domains: [],
      missingDomains: [...DOMAINS],
    };
  }

  const presentDomains: Domain[] = [];
  const missingDomains: Domain[] = [];

  for (const domain of DOMAINS) {
    const domainPath = join(rootPath, domain);
    if (await pathExists(domainPath)) {
      presentDomains.push(domain);
    } else {
      missingDomains.push(domain);
    }
  }

  return {
    exists: true,
    domains: presentDomains,
    missingDomains,
  };
}
