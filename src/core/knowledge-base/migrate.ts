/**
 * Flat-file incident → folder migration (2.3.0 PR3).
 *
 * Reads a legacy flat-file incident (e.g. `knowledge-base/2026-04-23-foo.md`)
 * and converts it into the folder form:
 *
 *   <flat-file>.md  →  <slug>/narrative.md
 *                      <slug>/facts.md (skeleton)
 *                      <slug>/evidence/ (empty, ready for artifacts)
 *
 * Idempotent: re-running on an already-migrated incident detects the folder
 * exists and warns + no-ops.
 */

import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, dirname, join } from 'path';
import matter from 'gray-matter';

export interface MigrateIncidentOptions {
  /** Absolute path to the flat-file incident markdown. */
  flatFilePath: string;
  /** If true, returns the migration plan without writing. */
  dryRun?: boolean;
}

export interface MigrateIncidentResult {
  flatFilePath: string;
  targetFolder: string;
  action: 'migrated' | 'already_migrated' | 'dry_run';
  narrativePath: string;
  factsPath: string;
  evidencePath: string;
  /** What the narrative.md content will be. */
  narrativeContent: string;
  /** What the facts.md content will be. */
  factsContent: string;
}

export async function migrateIncident(
  options: MigrateIncidentOptions
): Promise<MigrateIncidentResult> {
  const { flatFilePath, dryRun = false } = options;

  const sourceContent = await readFile(flatFilePath, 'utf-8');
  const parsed = matter(sourceContent);
  const fm = (parsed.data ?? {}) as Record<string, unknown>;

  // Derive the target folder name. Priority:
  //   1. Frontmatter `id:` (if YYYY-MM-DD-slug shape)
  //   2. The flat file's basename minus `.md`
  const flatBase = basename(flatFilePath, '.md');
  const idFromFrontmatter = typeof fm.id === 'string' ? fm.id : undefined;
  const folderSlug =
    idFromFrontmatter && /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(idFromFrontmatter)
      ? idFromFrontmatter
      : flatBase;

  const parentDir = dirname(flatFilePath);
  const targetFolder = join(parentDir, folderSlug);
  const narrativePath = join(targetFolder, 'narrative.md');
  const factsPath = join(targetFolder, 'facts.md');
  const evidencePath = join(targetFolder, 'evidence');

  // Build narrative.md frontmatter — promote/normalize fields, set tier.
  const narrativeFrontmatter: Record<string, unknown> = {
    title: fm.title ?? flatBase,
    tier: 'incident-narrative',
    domains: Array.isArray(fm.domains) ? fm.domains : ['incidents'],
    status: typeof fm.status === 'string' ? fm.status : 'active',
    last_updated:
      typeof fm.last_updated === 'string'
        ? fm.last_updated
        : new Date().toISOString().slice(0, 10),
    id: folderSlug,
    date: deriveDateFromSlug(folderSlug) ?? fm.date ?? folderSlug.slice(0, 10),
    severity: typeof fm.severity === 'string' ? fm.severity : 'medium',
    resolution_status:
      typeof fm.resolution_status === 'string' ? fm.resolution_status : 'resolved',
    components: Array.isArray(fm.components) ? fm.components : ['unknown'],
  };
  if (Array.isArray(fm.tags)) narrativeFrontmatter.tags = fm.tags;

  const narrativeContent = matter.stringify(parsed.content, narrativeFrontmatter);

  // Build facts.md skeleton.
  const factsFrontmatter: Record<string, unknown> = {
    title: `Facts from ${folderSlug}`,
    tier: 'incident-facts',
    domains: ['incidents'],
    status: 'active',
    last_updated: new Date().toISOString().slice(0, 10),
    incident_id: folderSlug,
    produced: [],
  };
  const factsContent = matter.stringify(
    `\n# Facts from ${folderSlug}\n\n## Produced\n_(No facts extracted yet. Use \`hewtd extract-facts ${folderSlug}/\` to propose facts from the narrative.)_\n`,
    factsFrontmatter
  );

  // Idempotency check: if target folder already exists, no-op.
  if (existsSync(targetFolder)) {
    return {
      flatFilePath,
      targetFolder,
      action: 'already_migrated',
      narrativePath,
      factsPath,
      evidencePath,
      narrativeContent,
      factsContent,
    };
  }

  if (dryRun) {
    return {
      flatFilePath,
      targetFolder,
      action: 'dry_run',
      narrativePath,
      factsPath,
      evidencePath,
      narrativeContent,
      factsContent,
    };
  }

  // Execute the migration.
  await mkdir(evidencePath, { recursive: true }); // also creates targetFolder
  await writeFile(narrativePath, narrativeContent, 'utf-8');
  await writeFile(factsPath, factsContent, 'utf-8');
  // Move the flat file to a `.migrated` extension so consumers don't read it
  // accidentally. Preserves the original for rollback.
  await rename(flatFilePath, `${flatFilePath}.migrated`);

  return {
    flatFilePath,
    targetFolder,
    action: 'migrated',
    narrativePath,
    factsPath,
    evidencePath,
    narrativeContent,
    factsContent,
  };
}

function deriveDateFromSlug(slug: string): string | undefined {
  const m = slug.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}
