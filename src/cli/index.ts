#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';
import { createScaffold, scaffoldExists } from '../generators/scaffold.js';
import { syncMetadata } from '../core/metadata/sync.js';
import { checkLinks } from '../core/links/checker.js';
import { auditDocumentation } from '../core/audit/auditor.js';
import { integrateDocument } from '../core/integrate/integrator.js';
import { runMaintenance } from '../core/maintain/orchestrator.js';
import { discoverPatterns } from '../core/discover/patterns.js';
import { discoverAntiPatterns } from '../core/discover/antipatterns.js';
import { discoverStandards } from '../core/discover/standards.js';
import { analyzeDependencies } from '../core/discover/dependencies.js';
import { saveHealthReport } from '../reports/health-report.js';
import { saveAuditReport } from '../reports/audit-report.js';
import { saveLinkReport } from '../reports/link-report.js';
import { DOMAINS, DOMAIN_DEFINITIONS } from '../core/domains/constants.js';

const program = new Command();

program
  .name('hit-em-with-the-docs')
  .description('Self-managing documentation system with hierarchical structure and intelligent automation')
  .version('1.0.0');

// Init command
program
  .command('init')
  .description('Initialize documentation structure')
  .option('-p, --path <path>', 'Path to create documentation', '.documentation')
  .option('-f, --force', 'Overwrite existing files', false)
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    if (await scaffoldExists(docsPath) && !options.force) {
      logger.warn('Documentation structure already exists. Use --force to overwrite.');
      process.exit(1);
    }

    const result = await createScaffold({
      rootPath: docsPath,
      overwrite: options.force,
    });

    if (!result.success) {
      logger.error('Failed to initialize documentation');
      process.exit(1);
    }
  });

// Maintain command
program
  .command('maintain')
  .description('Run full documentation maintenance')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option('-q, --quick', 'Quick mode (skip link checking)', false)
  .option('-f, --fix', 'Auto-fix issues', false)
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    const result = await runMaintenance({
      docsPath,
      quick: options.quick,
      fix: options.fix,
    });

    process.exit(result.success ? 0 : 1);
  });

// Metadata sync command
program
  .command('metadata-sync')
  .description('Sync metadata across all documentation')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option('-d, --domain <domain>', 'Specific domain to sync')
  .option('--dry-run', 'Preview changes without writing', false)
  .option('-f, --fix', 'Auto-fix missing metadata', false)
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    const result = await syncMetadata({
      docsPath,
      domain: options.domain,
      dryRun: options.dryRun,
      fix: options.fix,
    });

    if (result.errors.length > 0) {
      process.exit(1);
    }
  });

// Link check command
program
  .command('link-check')
  .description('Check all internal documentation links')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option('-d, --domain <domain>', 'Specific domain to check')
  .option('-r, --report', 'Generate detailed report', false)
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    const result = await checkLinks({
      docsPath,
      domain: options.domain,
    });

    if (options.report) {
      const reportPath = await saveLinkReport(docsPath, result);
      logger.success(`Report saved: ${reportPath}`);
    }

    if (result.brokenLinks.length > 0) {
      process.exit(1);
    }
  });

// Audit command
program
  .command('audit')
  .description('Audit documentation for compliance')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option('-d, --domain <domain>', 'Specific domain to audit')
  .option('-i, --issues-only', 'Show only issues', false)
  .option('-r, --report', 'Generate detailed report', false)
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    const result = await auditDocumentation({
      docsPath,
      domain: options.domain,
      issuesOnly: options.issuesOnly,
    });

    if (options.report) {
      const reportPath = await saveAuditReport(docsPath, result);
      logger.success(`Report saved: ${reportPath}`);
    }

    if (result.failedFiles > 0) {
      process.exit(1);
    }
  });

// Integrate command
program
  .command('integrate <file>')
  .description('Integrate a document into the documentation system')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option('-a, --auto', 'Auto mode (no prompts)', false)
  .option('--dry-run', 'Preview without writing', false)
  .option('-f, --force', 'Force integration even with duplicates', false)
  .action(async (file, options) => {
    const docsPath = resolve(process.cwd(), options.path);
    const filePath = resolve(process.cwd(), file);

    const result = await integrateDocument({
      filePath,
      docsPath,
      auto: options.auto,
      dryRun: options.dryRun,
      force: options.force,
    });

    if (!result.success) {
      logger.error(result.error ?? 'Integration failed');
      process.exit(1);
    }
  });

// Discover command with subcommands
const discover = program
  .command('discover')
  .description('Discover patterns and standards from codebase');

discover
  .command('patterns')
  .description('Discover coding patterns')
  .option('-r, --root <path>', 'Root path to scan', '.')
  .option('-l, --language <lang>', 'Filter by language')
  .option('-c, --category <cat>', 'Filter by category')
  .action(async (options) => {
    const rootPath = resolve(process.cwd(), options.root);

    await discoverPatterns({
      rootPath,
      language: options.language,
      category: options.category,
    });
  });

discover
  .command('anti-patterns')
  .description('Detect anti-patterns in codebase')
  .option('-r, --root <path>', 'Root path to scan', '.')
  .action(async (options) => {
    const rootPath = resolve(process.cwd(), options.root);

    await discoverAntiPatterns({
      rootPath,
    });
  });

discover
  .command('standards')
  .description('Extract implicit standards from codebase')
  .option('-r, --root <path>', 'Root path to scan', '.')
  .action(async (options) => {
    const rootPath = resolve(process.cwd(), options.root);

    await discoverStandards({
      rootPath,
    });
  });

discover
  .command('dependencies')
  .description('Analyze project dependencies')
  .option('-r, --root <path>', 'Root path to scan', '.')
  .action(async (options) => {
    const rootPath = resolve(process.cwd(), options.root);

    await analyzeDependencies({
      rootPath,
    });
  });

// Report command
program
  .command('report <type>')
  .description('Generate a report (health, audit, links)')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option('-f, --format <format>', 'Output format (markdown, json)', 'markdown')
  .action(async (type, options) => {
    const docsPath = resolve(process.cwd(), options.path);

    switch (type) {
      case 'health': {
        const result = await runMaintenance({ docsPath, quick: true, silent: true });
        const reportPath = await saveHealthReport(docsPath, result, options.format);
        logger.success(`Health report saved: ${reportPath}`);
        break;
      }
      case 'audit': {
        const result = await auditDocumentation({ docsPath, silent: true });
        const reportPath = await saveAuditReport(docsPath, result, options.format);
        logger.success(`Audit report saved: ${reportPath}`);
        break;
      }
      case 'links': {
        const result = await checkLinks({ docsPath, silent: true });
        const reportPath = await saveLinkReport(docsPath, result, options.format);
        logger.success(`Link report saved: ${reportPath}`);
        break;
      }
      default:
        logger.error(`Unknown report type: ${type}`);
        logger.info('Available types: health, audit, links');
        process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List all documentation domains')
  .action(() => {
    logger.header('Documentation Domains');

    const headers = ['Domain', 'Category', 'Priority', 'Description'];
    const rows = DOMAINS.map((d) => {
      const def = DOMAIN_DEFINITIONS[d];
      return [d, def.category, `${def.loadPriority}/10`, def.description];
    });

    logger.table(headers, rows);
  });

// Search command
program
  .command('search <query>')
  .description('Search documentation')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .action(async (query, options) => {
    const docsPath = resolve(process.cwd(), options.path);
    const { findMarkdownFiles } = await import('../utils/glob.js');
    const { readFile } = await import('fs/promises');
    const { relative } = await import('path');

    logger.header(`Search: "${query}"`);

    const files = await findMarkdownFiles(docsPath);
    const results: { file: string; matches: number }[] = [];
    const searchRegex = new RegExp(query, 'gi');

    for (const file of files) {
      try {
        const content = await readFile(file, 'utf-8');
        const matches = content.match(searchRegex);
        if (matches) {
          results.push({
            file: relative(docsPath, file),
            matches: matches.length,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (results.length === 0) {
      logger.info('No results found.');
      return;
    }

    results.sort((a, b) => b.matches - a.matches);

    logger.info(`Found ${results.length} files with matches:`);
    logger.newline();

    for (const result of results.slice(0, 20)) {
      logger.info(`  ${result.file} (${result.matches} matches)`);
    }

    if (results.length > 20) {
      logger.info(`  ...and ${results.length - 20} more`);
    }
  });

// Parse and execute
program.parse();
