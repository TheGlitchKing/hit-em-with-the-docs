/**
 * Flat-file incident → folder migration (2.3.0 PR3, target-path fix in 2.4.0).
 *
 * Reads a legacy flat-file incident and converts it into the folder form
 * AT THE CANONICAL VAULT LOCATION:
 *
 *   <flat-file>.md  →  <vault-root>/incidents/<slug>/narrative.md
 *                      <vault-root>/incidents/<slug>/facts.md (skeleton)
 *                      <vault-root>/incidents/<slug>/evidence/ (empty)
 *
 * In 2.3.0 the target was derived from the flat file's parent directory,
 * which produced folders OUTSIDE `<vault-root>/incidents/` when the source
 * was at the vault root. The `incidents/INDEX.md` generator scans only
 * `<vault-root>/incidents/<slug>/narrative.md` and silently missed those
 * folders. 2.4.0 fixes this by always writing under `<vault-root>/incidents/`.
 *
 * Idempotency:
 *   - If a valid `narrative.md` exists at EITHER the new path (canonical)
 *     OR the legacy path (`<source-parent>/<slug>/narrative.md`), the
 *     migration is treated as already done — no-op unless `--force`.
 *   - This protects against double-migration and is robust against
 *     consumers who already migrated under the 2.3.0 buggy layout.
 *
 * For consumers stuck on the 2.3.0 buggy layout, see `fixLegacyLayout()`
 * which moves stale folders into `<vault-root>/incidents/` and rewrites
 * any fact `provenance:` references.
 */

import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, dirname, join } from 'path';
import matter from 'gray-matter';

export interface MigrateIncidentOptions {
  /** Absolute path to the flat-file incident markdown. */
  flatFilePath: string;
  /**
   * Absolute path to the vault root. The migrated folder lands at
   * `<vaultRoot>/incidents/<slug>/`. Required since 2.4.0 — the 2.3.0
   * "sibling of the flat file" behavior was the source of the path bug.
   */
  vaultRoot: string;
  /** If true, returns the migration plan without writing. */
  dryRun?: boolean;
  /**
   * If true, proceed with migration even if a folder already exists at
   * the canonical or legacy location. Used to recover from a partial
   * migration.
   */
  force?: boolean;
}

export interface MigrateIncidentResult {
  flatFilePath: string;
  /** The canonical target — always under `<vaultRoot>/incidents/`. */
  targetFolder: string;
  action: 'migrated' | 'already_migrated' | 'dry_run';
  /**
   * Populated when `action === 'already_migrated'` to indicate WHERE the
   * existing migration was found. `'new'` = canonical `<vault>/incidents/`;
   * `'legacy'` = 2.3.0-style sibling-of-flat-file location. Helps consumers
   * decide whether to run `fix-legacy-layout`.
   */
  existingLocation?: 'new' | 'legacy';
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
  const { flatFilePath, vaultRoot, dryRun = false, force = false } = options;

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

  // Canonical target: <vault-root>/incidents/<slug>/
  const targetFolder = join(vaultRoot, 'incidents', folderSlug);
  const narrativePath = join(targetFolder, 'narrative.md');
  const factsPath = join(targetFolder, 'facts.md');
  const evidencePath = join(targetFolder, 'evidence');

  // Legacy 2.3.0 location: <source-parent>/<slug>/
  const legacyTargetFolder = join(dirname(flatFilePath), folderSlug);
  const legacyNarrativePath = join(legacyTargetFolder, 'narrative.md');

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

  // Idempotency check (unless --force): check BOTH new and legacy locations
  // for an existing valid migration.
  if (!force) {
    if (existsSync(narrativePath)) {
      return {
        flatFilePath,
        targetFolder,
        action: 'already_migrated',
        existingLocation: 'new',
        narrativePath,
        factsPath,
        evidencePath,
        narrativeContent,
        factsContent,
      };
    }
    if (existsSync(legacyNarrativePath)) {
      return {
        flatFilePath,
        targetFolder,
        action: 'already_migrated',
        existingLocation: 'legacy',
        narrativePath: legacyNarrativePath,
        factsPath: join(legacyTargetFolder, 'facts.md'),
        evidencePath: join(legacyTargetFolder, 'evidence'),
        narrativeContent,
        factsContent,
      };
    }
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

  // Ensure the canonical parent (<vault>/incidents/) exists. Generator
  // already handles a missing dir; we should too.
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
