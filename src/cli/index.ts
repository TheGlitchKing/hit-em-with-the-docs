#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { createRequire } from 'node:module';
import { registerUpdateCommands } from '@theglitchking/claude-plugin-runtime';
import { logger } from '../utils/logger.js';

const require_ = createRequire(import.meta.url);
const pkg = require_('../../package.json') as { version: string };
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
import { DOMAINS, DOMAIN_DEFINITIONS, isValidDomain, type Domain } from '../core/domains/constants.js';
import { regenerateIndexes } from '../generators/regenerate.js';

const program = new Command();

program
  .name('hit-em-with-the-docs')
  .description('Self-managing documentation system with hierarchical structure and intelligent automation')
  .version(pkg.version);

registerUpdateCommands(program, {
  packageName: '@theglitchking/hit-em-with-the-docs',
  pluginName: 'hit-em-with-the-docs',
  configFile: 'hit-em-with-the-docs.json',
});

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

// Index command
program
  .command('index')
  .alias('reindex')
  .description('Regenerate all domain + root INDEX.md / REGISTRY.md from documents on disk')
  .option('-p, --path <path>', 'Documentation path', '.documentation')
  .option(
    '-d, --domain <domain>',
    'Restrict domain INDEX/REGISTRY writes to one domain (root indexes still refreshed)'
  )
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    let domains: Domain[] | undefined;
    if (options.domain) {
      if (!isValidDomain(options.domain)) {
        logger.error(`Unknown domain: ${options.domain}`);
        logger.info(`Valid domains: ${DOMAINS.join(', ')}`);
        process.exit(1);
      }
      domains = [options.domain];
    }

    logger.header('Index Regeneration');

    const result = await regenerateIndexes({
      docsPath,
      ...(domains ? { domains } : {}),
      silent: true,
    });

    for (const domain of DOMAINS) {
      const count = result.documentCounts[domain] ?? 0;
      logger.info(`  ${domain.padEnd(16)} ${count} document${count === 1 ? '' : 's'}`);
    }
    logger.newline();
    logger.success(
      `${result.filesWritten.length} index files written · ${result.totalDocuments} documents total`
    );
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
  .option(
    '--strict',
    'Exit non-zero on ANY violation (including knowledge-base warnings); suitable for CI',
    false
  )
  .action(async (options) => {
    const docsPath = resolve(process.cwd(), options.path);

    const result = await auditDocumentation({
      docsPath,
      domain: options.domain,
      issuesOnly: options.issuesOnly,
      strict: options.strict,
    });

    if (options.report) {
      const reportPath = await saveAuditReport(docsPath, result);
      logger.success(`Report saved: ${reportPath}`);
    }

    // Strict mode escalates: exit non-zero on any error-severity issue OR any
    // KB-coded issue (including warning-severity ones like
    // FACT_VERIFY_COMMAND_MULTILINE_SHEBANG). Non-KB warnings (naming
    // convention, placement) do NOT fail strict mode — those are stylistic
    // and don't represent knowledge-base integrity violations.
    //
    // Normal mode: exit non-zero only on per-file errors (existing behavior
    // preserved from pre-2.3.0).
    if (options.strict) {
      const hasViolation = result.issues.some(
        (i) => i.severity === 'error' || i.code !== undefined
      );
      if (hasViolation) {
        logger.error('Strict mode: violations detected, exiting non-zero');
        process.exit(1);
      }
    } else if (result.failedFiles > 0) {
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

// --- 2.3.0: knowledge-base commands ---

program
  .command('find-citers <fact-id>')
  .description('Find all playbooks and incidents that cite a fact')
  .option('--json', 'Output as JSON', false)
  .action(async (factId, options) => {
    const projectRoot = process.cwd();
    const { loadPluginConfig, resolveVaultRoot, resolvePlaybookGlobs } = await import(
      '../utils/config.js'
    );
    const { buildCiterIndex, findCitersInIndex } = await import(
      '../core/knowledge-base/citers.js'
    );

    const config = await loadPluginConfig(projectRoot);
    const vaultRoot = resolveVaultRoot(projectRoot, config);
    const playbookGlobs = resolvePlaybookGlobs(projectRoot, config);

    const index = await buildCiterIndex({ projectRoot, vaultRoot, playbookGlobs });
    const result = findCitersInIndex(index, factId);

    if (options.json) {
      logger.info(JSON.stringify(result, null, 2));
      if (!result.fact_exists) process.exit(1);
      return;
    }

    logger.header(`Citers for fact: ${factId}`);
    if (!result.fact_exists) {
      logger.error(`Fact not found in vault.`);
      logger.info('Did you mean another fact id? Run `hewtd audit-facts` to see all known facts.');
      process.exit(1);
    }
    logger.info('');
    logger.info(`Citers (${result.citers.length}):`);
    for (const c of result.citers) logger.info(`  - ${c}`);
    logger.info('');
    logger.info(`Incidents (produced): ${result.incidents_produced_in.join(', ') || '(none)'}`);
    logger.info(`Incidents (strengthened): ${result.incidents_strengthened_by.join(', ') || '(none)'}`);
    logger.info(`Incidents (weakened): ${result.incidents_weakened_by.join(', ') || '(none)'}`);
  });

program
  .command('audit-facts')
  .description('Report facts past last_verified + audit_window_days')
  .option('--run-verify <fact-id>', 'Execute the fact\'s verify_command and update last_verified on success')
  .option('--window <days>', 'Override audit_window_days', undefined)
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    const projectRoot = process.cwd();
    const { loadPluginConfig, resolveVaultRoot, resolvePlaybookGlobs } = await import(
      '../utils/config.js'
    );
    const { buildCiterIndex } = await import('../core/knowledge-base/citers.js');
    const { auditFacts, runFactVerify } = await import('../core/knowledge-base/audit.js');

    const config = await loadPluginConfig(projectRoot);
    const vaultRoot = resolveVaultRoot(projectRoot, config);
    const playbookGlobs = resolvePlaybookGlobs(projectRoot, config);
    const window = options.window
      ? parseInt(options.window, 10)
      : config.vault.audit_window_days;

    const index = await buildCiterIndex({ projectRoot, vaultRoot, playbookGlobs });

    // --run-verify path
    if (options.runVerify) {
      const factId = options.runVerify;
      const fact = index.facts.get(factId);
      if (!fact) {
        logger.error(`Fact not found: ${factId}`);
        process.exit(1);
      }
      logger.header(`Running verify command for: ${factId}`);
      const result = await runFactVerify({ fact: fact!, vaultRoot });
      if (options.json) {
        logger.info(JSON.stringify(result, null, 2));
      } else {
        logger.info(`exit code: ${result.exitCode}`);
        if (result.stdout) logger.info(`stdout: ${result.stdout.trim()}`);
        if (result.stderr) logger.info(`stderr: ${result.stderr.trim()}`);
        if (result.updated) {
          logger.success(`Updated last_verified to ${result.newLastVerified}`);
        } else if (result.executed) {
          logger.error('Verify command failed; last_verified not updated.');
        }
      }
      process.exit(result.updated ? 0 : 1);
    }

    // List stale path
    const audit = auditFacts({ index, auditWindowDays: window });

    if (options.json) {
      logger.info(JSON.stringify(audit, null, 2));
      if (audit.stale.length > 0) process.exit(1);
      return;
    }

    logger.header(`Stale facts (verified > ${window}d ago):`);
    if (audit.stale.length === 0) {
      logger.success('No stale facts.');
    } else {
      for (const s of audit.stale) {
        logger.info(
          `  ${s.id}    ${s.lastVerified}  (${s.daysSinceVerified}d)  confidence:${s.confidence ?? '?'}`
        );
      }
      logger.info('');
      logger.info('Run verify commands:');
      logger.info(`  hewtd audit-facts --run-verify <fact-id>`);
    }

    if (audit.unverifiable.length > 0) {
      logger.warn(`Unverifiable facts (malformed/missing last_verified): ${audit.unverifiable.length}`);
      for (const u of audit.unverifiable) {
        logger.info(`  ${u.id}    ${u.relPath}`);
      }
    }

    if (audit.stale.length > 0) process.exit(1);
  });

program
  .command('cite <fact-id>')
  .description('Insert a cites: entry for the named fact into a playbook')
  .option('-f, --file <path>', 'Path to the playbook to modify (required)')
  .option('--alert-name <name>', 'Target the symptom entry with this exact alert_name')
  .option('--user-phrase <phrase>', 'Target the symptom entry with this user_phrase')
  .option('--error-pattern <pattern>', 'Target the symptom entry with this error_pattern')
  .option('--dry-run', 'Preview the change without writing', false)
  .action(async (factId, options) => {
    if (!options.file) {
      logger.error('--file <path> is required');
      process.exit(1);
    }
    const playbookPath = resolve(process.cwd(), options.file);
    const { cite } = await import('../core/knowledge-base/cite.js');

    const symptomMatch: NonNullable<Parameters<typeof cite>[0]['symptomMatch']> = {};
    if (options.alertName) symptomMatch.alert_name = options.alertName;
    if (options.userPhrase) symptomMatch.user_phrase = options.userPhrase;
    if (options.errorPattern) symptomMatch.error_pattern = options.errorPattern;

    const citeOpts: Parameters<typeof cite>[0] = {
      playbookPath,
      factId,
      dryRun: options.dryRun,
    };
    if (Object.keys(symptomMatch).length > 0) {
      citeOpts.symptomMatch = symptomMatch;
    }
    const result = await cite(citeOpts);

    logger.header(`hewtd cite: ${factId}`);
    logger.info(`Playbook: ${result.playbookPath}`);
    logger.info(`Action:   ${result.action}`);
    logger.info(`Symptom:  index ${result.symptomIndex}`);
    if (options.dryRun) {
      logger.info('');
      logger.info('--- proposed content ---');
      logger.info(result.newContent);
    }
  });

program
  .command('migrate-incident <flat-file>')
  .description('Convert a legacy flat-file incident into the folder form (narrative.md + facts.md). Always writes to <vault-root>/incidents/<slug>/.')
  .option('--dry-run', 'Preview the migration without writing', false)
  .option('--force', 'Migrate even if a folder already exists at the canonical or legacy location (overwrites)', false)
  .action(async (flatFile, options) => {
    const projectRoot = process.cwd();
    const flatFilePath = resolve(projectRoot, flatFile);
    const { migrateIncident } = await import('../core/knowledge-base/migrate.js');
    const { loadPluginConfig, resolveVaultRoot } = await import('../utils/config.js');

    const config = await loadPluginConfig(projectRoot);
    const vaultRoot = resolveVaultRoot(projectRoot, config);

    const result = await migrateIncident({
      flatFilePath,
      vaultRoot,
      dryRun: options.dryRun,
      force: options.force,
    });

    logger.header(`hewtd migrate-incident`);
    logger.info(`Source:        ${result.flatFilePath}`);
    logger.info(`Target folder: ${result.targetFolder}`);
    logger.info(`Action:        ${result.action}`);
    if (result.action === 'dry_run') {
      logger.info('');
      logger.info('--- narrative.md ---');
      logger.info(result.narrativeContent);
      logger.info('--- facts.md ---');
      logger.info(result.factsContent);
    } else if (result.action === 'migrated') {
      logger.success(`Migrated to ${result.targetFolder}`);
      logger.info(`  narrative: ${result.narrativePath}`);
      logger.info(`  facts:     ${result.factsPath}`);
      logger.info(`  evidence:  ${result.evidencePath} (empty)`);
      logger.info(`  original:  ${result.flatFilePath}.migrated (renamed for rollback)`);
    } else if (result.action === 'already_migrated') {
      logger.warn(`Already migrated.`);
      if (result.existingLocation === 'legacy') {
        logger.warn(`  Existing folder is at the 2.3.0 legacy location: ${result.narrativePath}`);
        logger.warn(`  Run \`hewtd fix-legacy-layout\` to relocate it under incidents/.`);
      } else {
        logger.info(`  Existing folder: ${result.narrativePath}`);
      }
      logger.info(`  Use --force to re-migrate (overwrites).`);
    }
  });

program
  .command('fix-legacy-layout')
  .description('Relocate incident folders written by buggy 2.3.0 migrate-incident into the canonical <vault>/incidents/ parent, and rewrite any provenance: refs in fact files. Idempotent.')
  .option('--dry-run', 'Report what would be moved without writing', false)
  .action(async (options) => {
    const projectRoot = process.cwd();
    const { fixLegacyLayout } = await import(
      '../core/knowledge-base/fix-legacy-layout.js'
    );
    const { loadPluginConfig, resolveVaultRoot } = await import(
      '../utils/config.js'
    );

    const config = await loadPluginConfig(projectRoot);
    const vaultRoot = resolveVaultRoot(projectRoot, config);

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot,
      dryRun: options.dryRun,
    });

    logger.header(`hewtd fix-legacy-layout`);
    logger.info(`Vault root: ${result.vaultRoot}`);
    logger.info(`Action:     ${result.action}`);

    if (result.action === 'no_op') {
      logger.success('No legacy-layout incident folders found. Nothing to do.');
      return;
    }

    if (result.moved.length > 0) {
      logger.info('');
      logger.info(`Moved ${result.moved.length} folder${result.moved.length === 1 ? '' : 's'}:`);
      for (const m of result.moved) {
        logger.info(`  ${m.from} → ${m.to}`);
      }
    }

    if (result.rewrittenProvenance.length > 0) {
      logger.info('');
      logger.info(`Rewrote ${result.rewrittenProvenance.length} provenance reference${result.rewrittenProvenance.length === 1 ? '' : 's'}:`);
      for (const r of result.rewrittenProvenance) {
        logger.info(`  ${r.factPath}: ${r.oldRef} → ${r.newRef}`);
      }
    }

    if (result.skipped.length > 0) {
      logger.warn('');
      logger.warn(`Skipped ${result.skipped.length}:`);
      for (const s of result.skipped) {
        logger.warn(`  ${s.path} — ${s.reason}`);
      }
    }

    if (result.action === 'dry_run') {
      logger.info('');
      logger.info('Dry-run — no files were moved. Re-run without --dry-run to apply.');
    } else {
      logger.success('');
      logger.success('Done. Run `hewtd maintain` to regenerate indexes.');
    }
  });

program
  .command('extract-facts <incident-folder>')
  .description('Write accepted fact specs to <vault>/facts/. Specs come from the /hit-em-with-the-docs:extract-facts slash command.')
  .option(
    '--accept <json>',
    'JSON-encoded FactSpec array. Use single-quoted JSON: --accept \'[{"id":"...","title":"...","confidence":"high","claim":"..."}]\'',
    undefined
  )
  .option('--dry-run', 'Preview without writing', false)
  .action(async (incidentFolderArg, options) => {
    if (!options.accept) {
      logger.error(
        '--accept <json> is required. This CLI is the WRITER; use the /hit-em-with-the-docs:extract-facts slash command for the LLM-driven proposer.'
      );
      process.exit(1);
    }
    let accept: unknown;
    try {
      accept = JSON.parse(options.accept);
    } catch (err) {
      logger.error(`--accept must be valid JSON: ${(err as Error).message}`);
      process.exit(1);
    }
    if (!Array.isArray(accept)) {
      logger.error('--accept must be a JSON array of FactSpec objects');
      process.exit(1);
    }

    const projectRoot = process.cwd();
    const incidentFolder = resolve(projectRoot, incidentFolderArg);
    const { loadPluginConfig, resolveVaultRoot } = await import('../utils/config.js');
    const { extractFacts } = await import('../core/knowledge-base/extract.js');

    const config = await loadPluginConfig(projectRoot);
    const vaultRoot = resolveVaultRoot(projectRoot, config);

    // Trust the caller's JSON shape — the slash command produced it after
    // the user accepted proposals. Runtime errors surface naturally.
    const result = await extractFacts({
      incidentFolder,
      vaultRoot,
      projectRoot,
      accept: accept as Parameters<typeof extractFacts>[0]['accept'],
      dryRun: options.dryRun,
    });

    logger.header(`hewtd extract-facts: ${result.incidentId}`);
    for (const f of result.extractedFacts) {
      const tag = f.action === 'created' ? '✓ created' : '· skipped (exists)';
      logger.info(`  ${tag}  ${f.factPath}`);
    }
    if (result.factsMdUpdated) {
      logger.success(`Updated ${result.factsMdPath} (produced: list)`);
    }
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
