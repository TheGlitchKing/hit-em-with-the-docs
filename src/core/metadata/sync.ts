import { readFile, writeFile } from 'fs/promises';
import { relative } from 'path';
import { findMarkdownFiles, pathExists } from '../../utils/glob.js';
import { join } from 'path';
import { parseFrontmatter, setFrontmatter } from '../../utils/frontmatter.js';
import { countWords, formatReadTime } from '../../utils/markdown.js';
import { logger } from '../../utils/logger.js';
import { getAllDomains } from '../domains/registry.js';
import {
  validatePartialMetadata,
  getMissingRequiredFields,
  calculateMetadataCompleteness,
  type PartialDocumentMetadata,
} from './schema.js';
import { generateMetadata, mergeMetadata, formatDate } from './generator.js';

export interface SyncOptions {
  docsPath: string;
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
  // Reads are unaffected: a scan writes nothing, and being able to inspect an
  // unmanaged directory is useful. `--dry-run` is likewise allowed, so the
  // preview of what `--fix` would do still works anywhere.
  if (fix && !dryRun && !(await isDocumentationRoot(docsPath))) {
    const message =
      `${docsPath} is not a hit-em-with-the-docs documentation root, so --fix ` +
      `refuses to write there. --fix stamps frontmatter into every markdown file it ` +
      `finds, and pointed at a source tree it rewrites files that are not ` +
      `documentation. Run \`hewtd init\` to create the tree, pass --path to point at ` +
      `an existing one, or drop --fix to scan read-only.`;
    if (!silent) logger.error(message);
    result.errors.push({
      file: relative(process.cwd(), docsPath),
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
 * Does this directory look like a tree hewtd manages?
 *
 * Two markers, either sufficient:
 *
 *   - a root `INDEX.md` — what `scaffoldExists` already treats as the sign of a
 *     scaffolded tree;
 *   - a folder named for an active domain — which covers a tree whose docs are
 *     in place but whose indexes have not been generated yet. `maintain` is
 *     exactly that case: it syncs at Step 1 and only regenerates indexes at
 *     Step 1.5, so requiring INDEX.md alone would fail a legitimate first run.
 *
 * Residual hole, accepted knowingly: a repository whose root happens to hold a
 * directory named for a built-in domain (`api/`, `testing/`) would pass the
 * second marker if someone explicitly aimed `--fix` at it. Narrow, and it still
 * takes a deliberate `--path`. The alternative — demanding INDEX.md always —
 * fires on correct operations, and a check that does that is one people learn
 * to route around.
 */
async function isDocumentationRoot(docsPath: string): Promise<boolean> {
  if (await pathExists(join(docsPath, 'INDEX.md'))) return true;

  for (const domain of getAllDomains()) {
    if (await pathExists(join(docsPath, domain))) return true;
  }

  return false;
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

  const merged = mergeMetadata(data, generated);
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
  return {
    ...metadata,
    word_count: countWords(content),
    estimated_read_time: formatReadTime(content),
    last_validated: formatDate(new Date()),
  };
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
