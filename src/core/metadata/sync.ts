import { readFile, writeFile } from 'fs/promises';
import { relative } from 'path';
import { findMarkdownFiles, pathExists } from '../../utils/glob.js';
import { join, resolve, sep } from 'path';
import { loadPluginConfig, resolveDocsRoot } from '../../utils/config.js';
import { parseFrontmatter, setFrontmatter } from '../../utils/frontmatter.js';
import { countWords, formatReadTime } from '../../utils/markdown.js';
import { logger } from '../../utils/logger.js';
import {
  validatePartialMetadata,
  getMissingRequiredFields,
  calculateMetadataCompleteness,
  type PartialDocumentMetadata,
} from './schema.js';
import { generateMetadata, mergeMetadata, formatDate } from './generator.js';

export interface SyncOptions {
  docsPath: string;
  /**
   * Project root the `docs_root` declaration is resolved against. Defaults to
   * `process.cwd()`, which is what the CLI wants; pass it explicitly when the
   * docs tree is not under the current directory.
   */
  projectRoot?: string;
  dryRun?: boolean;
  fix?: boolean;
  domain?: string;
  silent?: boolean;
}

export interface SyncResult {
  totalFiles: number;
  validFiles: number;
  fixedFiles: number;
  skippedFiles: number;
  errors: SyncError[];
  stats: SyncStats;
}

export interface SyncError {
  file: string;
  error: string;
  fixable: boolean;
}

export interface SyncStats {
  totalWordCount: number;
  avgCompleteness: number;
  byDomain: Record<string, number>;
  byStatus: Record<string, number>;
  byTier: Record<string, number>;
}

/**
 * Sync metadata across all documentation files
 */
export async function syncMetadata(options: SyncOptions): Promise<SyncResult> {
  const {
    docsPath,
    projectRoot = process.cwd(),
    dryRun = false,
    fix = false,
    domain,
    silent = false,
  } = options;

  const result: SyncResult = {
    totalFiles: 0,
    validFiles: 0,
    fixedFiles: 0,
    skippedFiles: 0,
    errors: [],
    stats: {
      totalWordCount: 0,
      avgCompleteness: 0,
      byDomain: {},
      byStatus: {},
      byTier: {},
    },
  };

  if (!silent) {
    logger.header('Metadata Sync');
    if (dryRun) logger.info('Running in dry-run mode (no changes will be made)');
    if (fix) logger.info('Auto-fix mode enabled');
  }

  // Refuse to WRITE into a directory that is not a hewtd documentation root.
  //
  // `--path` takes any directory, and `syncFile` stamps 16 lines of hewtd
  // frontmatter onto whatever markdown it finds. Pointed at a repo root it
  // rewrote unrelated markdown across the tree — infrastructure notes, test
  // fixtures, loose READMEs (#25). Nothing about the name `metadata-sync`
  // warns of that, and the damage spreads over hundreds of files at once.
  //
  // The root is whatever the project DECLARES (`docs_root`), not whatever looks
  // docs-shaped — see `isDocumentationRoot`.
  //
  // Reads are unaffected: a scan writes nothing, and being able to inspect an
  // unmanaged directory is useful. `--dry-run` is likewise allowed, so the
  // preview of what `--fix` would do still works anywhere.
  if (fix && !dryRun && !(await isDocumentationRoot(docsPath, projectRoot))) {
    const message =
      `${docsPath} is outside this project's documentation root, so --fix refuses ` +
      `to write there. --fix stamps frontmatter into every markdown file it finds, ` +
      `and pointed at a source tree it rewrites files that are not documentation. ` +
      `The root is \`docs_root\` in .claude/hit-em-with-the-docs.json (default ` +
      `\`.documentation\`) — set it if your docs live elsewhere, point --path inside ` +
      `it, or drop --fix to scan read-only.`;
    if (!silent) logger.error(message);
    result.errors.push({
      file: relative(projectRoot, docsPath),
      error: message,
      fixable: false,
    });
    return result;
  }

  // Find all markdown files
  let files = await findMarkdownFiles(docsPath);

  // Filter by domain if specified
  if (domain) {
    files = files.filter((f) => {
      const rel = relative(docsPath, f);
      return rel.startsWith(domain + '/') || rel.startsWith(domain + '\\');
    });
  }

  // Exclude INDEX.md and REGISTRY.md files (system files)
  files = files.filter((f) => {
    const name = f.split(/[/\\]/).pop() ?? '';
    return !['INDEX.md', 'REGISTRY.md'].includes(name);
  });

  result.totalFiles = files.length;

  if (!silent) {
    logger.info(`Found ${files.length} documentation files`);
  }

  let completenessSum = 0;

  for (const file of files) {
    try {
      const syncResult = await syncFile(file, docsPath, dryRun, fix);

      if (syncResult.valid) {
        result.validFiles++;
      }

      if (syncResult.fixed) {
        result.fixedFiles++;
      }

      if (syncResult.skipped) {
        result.skippedFiles++;
      }

      if (syncResult.error) {
        result.errors.push(syncResult.error);
      }

      // Update stats
      if (syncResult.metadata) {
        const meta = syncResult.metadata;
        completenessSum += syncResult.completeness;
        result.stats.totalWordCount += meta.word_count ?? 0;

        // Track by domain
        const domain = meta.domains?.[0] ?? 'unknown';
        result.stats.byDomain[domain] = (result.stats.byDomain[domain] ?? 0) + 1;

        // Track by status
        const status = meta.status ?? 'unknown';
        result.stats.byStatus[status] = (result.stats.byStatus[status] ?? 0) + 1;

        // Track by tier
        const tier = meta.tier ?? 'unknown';
        result.stats.byTier[tier] = (result.stats.byTier[tier] ?? 0) + 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({
        file: relative(docsPath, file),
        error: message,
        fixable: false,
      });
    }
  }

  // Calculate average completeness
  result.stats.avgCompleteness =
    files.length > 0 ? completenessSum / files.length : 0;

  if (!silent) {
    logger.newline();
    logger.success(`Sync complete!`);
    logger.info(`Valid: ${result.validFiles}/${result.totalFiles}`);
    if (result.fixedFiles > 0) {
      logger.info(`Fixed: ${result.fixedFiles}`);
    }
    if (result.errors.length > 0) {
      logger.warn(`Errors: ${result.errors.length}`);
    }
    logger.info(`Avg completeness: ${result.stats.avgCompleteness.toFixed(1)}%`);
  }

  return result;
}

/**
 * Is this path the project's documentation root, or inside it?
 *
 * Answered from what the project *declares* (`docs_root` in
 * `.claude/hit-em-with-the-docs.json`, default `.documentation`) rather than by
 * sniffing the directory's contents. The distinction matters: a content sniff
 * asks "does this look like a docs tree?", which any repository with a
 * top-level `api/` or `testing/` folder can accidentally satisfy. A declaration
 * asks "is this the tree this project said its documentation lives in", which
 * nothing satisfies by accident.
 *
 * The `INDEX.md` fallback covers a tree scaffolded somewhere other than the
 * declared root — `hewtd init -p docs` and then `metadata-sync -p docs`. hewtd
 * writes that file, so its presence is a positive marker rather than a guess; a
 * source tree does not have one at its root.
 */
async function isDocumentationRoot(docsPath: string, projectRoot: string): Promise<boolean> {
  const declared = resolveDocsRoot(projectRoot, await loadPluginConfig(projectRoot));

  const target = resolve(docsPath);
  if (target === declared || target.startsWith(declared + sep)) return true;

  return pathExists(join(docsPath, 'INDEX.md'));
}

interface FileSyncResult {
  valid: boolean;
  fixed: boolean;
  skipped: boolean;
  completeness: number;
  metadata?: PartialDocumentMetadata;
  error?: SyncError;
}

/**
 * Sync metadata for a single file
 */
async function syncFile(
  filePath: string,
  docsPath: string,
  dryRun: boolean,
  fix: boolean
): Promise<FileSyncResult> {
  const result: FileSyncResult = {
    valid: false,
    fixed: false,
    skipped: false,
    completeness: 0,
  };

  const content = await readFile(filePath, 'utf-8');
  const { data, content: body } = parseFrontmatter<PartialDocumentMetadata>(content);

  // Validate existing metadata
  const validation = validatePartialMetadata(data);
  const missingRequired = getMissingRequiredFields(data as Record<string, unknown>);
  result.completeness = calculateMetadataCompleteness(data as Record<string, unknown>);

  // Check if file is valid
  if (validation.valid && missingRequired.length === 0) {
    result.valid = true;
    result.metadata = data;

    // Still update auto-generated fields if fix mode
    if (fix) {
      const updated = updateAutoFields(data, body);
      if (JSON.stringify(updated) !== JSON.stringify(data)) {
        if (!dryRun) {
          const newContent = setFrontmatter(content, updated as Record<string, unknown>);
          await writeFile(filePath, newContent, 'utf-8');
        }
        result.fixed = true;
        result.metadata = updated;
      }
    }

    return result;
  }

  // File has issues
  if (!fix) {
    result.error = {
      file: relative(docsPath, filePath),
      error: `Missing required fields: ${missingRequired.join(', ')}`,
      fixable: true,
    };
    return result;
  }

  // Fix mode: generate missing metadata
  const generated = generateMetadata({
    filePath,
    content,
    docsRoot: docsPath,
    existingMetadata: data,
  });

  const merged = normalizeDateFields(mergeMetadata(data, generated));
  result.metadata = merged;

  if (!dryRun) {
    const newContent = setFrontmatter(content, merged as unknown as Record<string, unknown>);
    await writeFile(filePath, newContent, 'utf-8');
  }

  result.fixed = true;
  result.valid = true;
  result.completeness = calculateMetadataCompleteness(merged as unknown as Record<string, unknown>);

  return result;
}

/**
 * Update auto-generated fields
 */
function updateAutoFields(
  metadata: PartialDocumentMetadata,
  content: string
): PartialDocumentMetadata {
  return normalizeDateFields({
    ...metadata,
    word_count: countWords(content),
    estimated_read_time: formatReadTime(content),
    last_validated: formatDate(new Date()),
  });
}

/** Frontmatter fields the schema types as `YYYY-MM-DD`. */
const DATE_FIELDS = [
  'last_updated',
  'last_validated',
  'last_verified',
  'archived_on',
  'date',
] as const;

/**
 * Truncate full ISO timestamps in date fields to `YYYY-MM-DD` on disk.
 *
 * The schema accepts either form, but only `--fix` can settle what the file
 * actually says. Leaving `2026-04-18T00:00:00.000Z` in place meant a doc that
 * validated only via a preprocess step, and read as a different type to any
 * other tool looking at the same frontmatter.
 */
function normalizeDateFields<T extends PartialDocumentMetadata>(metadata: T): T {
  const out = { ...metadata } as Record<string, unknown>;
  for (const field of DATE_FIELDS) {
    const value = out[field];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      out[field] = value.slice(0, 10);
    }
  }
  return out as T;
}

/**
 * Get sync statistics for a documentation root
 */
export async function getSyncStats(docsPath: string): Promise<SyncStats> {
  const result = await syncMetadata({
    docsPath,
    dryRun: true,
    fix: false,
    silent: true,
  });

  return result.stats;
}
