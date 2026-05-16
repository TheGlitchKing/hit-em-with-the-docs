import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { DOMAINS, type Domain } from '../core/domains/constants.js';
import { parseFrontmatter } from '../utils/frontmatter.js';
import { formatDate } from '../core/metadata/generator.js';
import { pathExists } from '../utils/glob.js';
import { logger } from '../utils/logger.js';
import {
  generateRootIndex,
  generateDomainIndexContent,
  type IndexEntry,
} from './index-generator.js';
import {
  generateRootRegistry,
  generateDomainRegistryContent,
} from './registry-generator.js';

/** Generated files that are never themselves treated as documents. */
const SYSTEM_FILES = new Set(['INDEX.md', 'REGISTRY.md']);

export interface RegenerateOptions {
  /** Path to the documentation root (e.g. `.documentation`). */
  docsPath: string;
  /**
   * Restrict domain INDEX.md/REGISTRY.md writes to these domains. The root
   * INDEX.md/REGISTRY.md are always refreshed regardless. Defaults to all
   * domains.
   */
  domains?: Domain[];
  silent?: boolean;
}

export interface RegenerateResult {
  /** Per-domain document counts — all domains, regardless of the filter. */
  documentCounts: Record<string, number>;
  /** Absolute paths of every INDEX.md / REGISTRY.md written. */
  filesWritten: string[];
  /** Total documents across all domains. */
  totalDocuments: number;
}

/**
 * List the document files in a domain directory, excluding the generated
 * INDEX.md / REGISTRY.md. Returns sorted file names (not paths). Empty when
 * the domain directory does not exist.
 */
export async function listDomainDocFiles(
  docsPath: string,
  domain: string
): Promise<string[]> {
  try {
    const names = await readdir(join(docsPath, domain));
    return names
      .filter((n) => n.endsWith('.md') && !SYSTEM_FILES.has(n))
      .sort();
  } catch {
    return [];
  }
}

/** Normalise a frontmatter date (Date | ISO string | plain date) to YYYY-MM-DD. */
function normalizeDate(value: unknown): string {
  if (value instanceof Date) return formatDate(value);
  if (typeof value === 'string') {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : value;
  }
  return formatDate(new Date());
}

/** Count words in a markdown body (frontmatter already stripped). */
function countWords(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

/** Derive a human title from a file name when frontmatter has no title. */
function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build IndexEntry[] for one domain by reading every document's frontmatter.
 * `pathPrefix` is prepended to each entry's `path` — `''` for domain-relative
 * paths (domain INDEX/REGISTRY) or `'<domain>/'` for root-relative paths.
 */
async function buildDomainEntries(
  docsPath: string,
  domain: string,
  pathPrefix: string
): Promise<IndexEntry[]> {
  const files = await listDomainDocFiles(docsPath, domain);
  const entries: IndexEntry[] = [];

  for (const fileName of files) {
    let raw: string;
    try {
      raw = await readFile(join(docsPath, domain, fileName), 'utf-8');
    } catch {
      continue;
    }

    const { data, content } = parseFrontmatter<Record<string, unknown>>(raw);
    entries.push({
      path: pathPrefix + fileName,
      title:
        typeof data.title === 'string' && data.title.trim()
          ? data.title
          : titleFromFileName(fileName),
      tier: typeof data.tier === 'string' ? data.tier : 'guide',
      status: typeof data.status === 'string' ? data.status : 'active',
      lastUpdated: normalizeDate(data.last_updated),
      wordCount:
        typeof data.word_count === 'number'
          ? data.word_count
          : countWords(content),
    });
  }

  return entries;
}

/**
 * Regenerate domain + root INDEX.md / REGISTRY.md from the documents on disk.
 *
 * This is the single source of truth for index generation, shared by
 * `integrate`, `maintain`, and the `index` CLI command. It replaces the
 * fragile regex-append path in `integrate` that could only update an
 * already-populated table — and silently no-op'd on a freshly scaffolded
 * INDEX.md, so the first document into any domain was never registered
 * (see https://github.com/TheGlitchKing/hit-em-with-the-docs/issues/7).
 */
export async function regenerateIndexes(
  options: RegenerateOptions
): Promise<RegenerateResult> {
  const { docsPath, silent = false } = options;
  const targetDomains = options.domains ?? [...DOMAINS];

  const result: RegenerateResult = {
    documentCounts: {},
    filesWritten: [],
    totalDocuments: 0,
  };

  // Scan every domain — the root INDEX needs counts for all of them even
  // when only a subset of domain files is being rewritten.
  const rootEntriesByDomain: Record<string, IndexEntry[]> = {};

  for (const domain of DOMAINS) {
    const domainEntries = await buildDomainEntries(docsPath, domain, '');
    result.documentCounts[domain] = domainEntries.length;
    result.totalDocuments += domainEntries.length;
    rootEntriesByDomain[domain] = domainEntries.map((e) => ({
      ...e,
      path: `${domain}/${e.path}`,
    }));

    // Only (re)write a domain's own files when it is in the target set and
    // its directory actually exists on disk.
    if (!targetDomains.includes(domain)) continue;
    const domainDir = join(docsPath, domain);
    if (!(await pathExists(domainDir))) continue;

    const indexPath = join(domainDir, 'INDEX.md');
    const registryPath = join(domainDir, 'REGISTRY.md');
    await writeFile(
      indexPath,
      generateDomainIndexContent(domain, domainEntries),
      'utf-8'
    );
    await writeFile(
      registryPath,
      generateDomainRegistryContent(domain, domainEntries),
      'utf-8'
    );
    result.filesWritten.push(indexPath, registryPath);
  }

  // Root INDEX.md / REGISTRY.md — always refreshed.
  if (await pathExists(docsPath)) {
    const rootIndexPath = join(docsPath, 'INDEX.md');
    const rootRegistryPath = join(docsPath, 'REGISTRY.md');
    await writeFile(
      rootIndexPath,
      generateRootIndex(rootEntriesByDomain as Record<Domain, IndexEntry[]>),
      'utf-8'
    );
    await writeFile(rootRegistryPath, generateRootRegistry(), 'utf-8');
    result.filesWritten.push(rootIndexPath, rootRegistryPath);
  }

  if (!silent) {
    logger.success(
      `Regenerated ${result.filesWritten.length} index file(s) — ` +
        `${result.totalDocuments} document(s) across ${DOMAINS.length} domains`
    );
  }

  return result;
}
