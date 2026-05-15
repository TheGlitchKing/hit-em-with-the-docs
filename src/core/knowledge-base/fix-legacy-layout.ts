/**
 * Migrate 2.3.0-buggy incident folders into the canonical layout (2.4.0).
 *
 * In 2.3.0, `hewtd migrate-incident <flat-file>` wrote the new folder
 * AS A SIBLING of the flat file. When the flat file lived at the vault
 * root (the documented example), the resulting folder ended up at
 * `<vault-root>/<slug>/` instead of `<vault-root>/incidents/<slug>/`.
 * The `incidents/INDEX.md` generator scans only the canonical path, so
 * those folders were silently absent from the index.
 *
 * This module:
 *   1. Detects legacy folders — anything matching `<vault-root>/<slug>/`
 *      that contains a valid `narrative.md` AND isn't already under the
 *      canonical `<vault-root>/incidents/` parent.
 *   2. Moves them into `<vault-root>/incidents/<slug>/` (preserving any
 *      `facts.md` / `evidence/` contents).
 *   3. Rewrites `provenance:` references in any `<vault-root>/facts/*.md`
 *      files that pointed at the old folder paths.
 *
 * Idempotent: re-running on a clean vault is a no-op with a status report.
 */

import { readFile, writeFile, rename, mkdir, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative } from 'path';
import matter from 'gray-matter';

export interface FixLegacyLayoutOptions {
  /** Absolute vault root. */
  vaultRoot: string;
  /** Project root — used for relative-path provenance rewrites. */
  projectRoot: string;
  /** If true, returns the plan without writing. */
  dryRun?: boolean;
}

export interface MovedFolder {
  /** Slug (folder basename), e.g. `2026-04-23-keycloak-idle-session`. */
  slug: string;
  /** Absolute source path (legacy). */
  from: string;
  /** Absolute destination path (canonical). */
  to: string;
}

export interface RewrittenProvenance {
  /** Absolute fact file path. */
  factPath: string;
  /** Old provenance string that was replaced. */
  oldRef: string;
  /** New provenance string. */
  newRef: string;
}

export interface FixLegacyLayoutResult {
  vaultRoot: string;
  moved: MovedFolder[];
  rewrittenProvenance: RewrittenProvenance[];
  /** Paths that LOOKED like incident folders but were ambiguous. Reported but not moved. */
  skipped: { path: string; reason: string }[];
  action: 'fixed' | 'no_op' | 'dry_run';
}

/**
 * Discover and (optionally) relocate 2.3.0-layout incident folders.
 */
export async function fixLegacyLayout(
  options: FixLegacyLayoutOptions
): Promise<FixLegacyLayoutResult> {
  const { vaultRoot, projectRoot, dryRun = false } = options;

  const result: FixLegacyLayoutResult = {
    vaultRoot,
    moved: [],
    rewrittenProvenance: [],
    skipped: [],
    action: 'no_op',
  };

  if (!existsSync(vaultRoot)) {
    return result;
  }

  // Walk one level deep under vaultRoot, looking for `<slug>/narrative.md`
  // entries that are NOT inside `incidents/`, `facts/`, or `symptoms/`.
  const RESERVED_DIRS = new Set(['incidents', 'facts', 'symptoms']);
  const topLevel = await readdir(vaultRoot, { withFileTypes: true });
  const legacyCandidates: MovedFolder[] = [];

  for (const entry of topLevel) {
    if (!entry.isDirectory()) continue;
    if (RESERVED_DIRS.has(entry.name)) continue;

    const folderPath = join(vaultRoot, entry.name);
    const narrativePath = join(folderPath, 'narrative.md');
    if (!existsSync(narrativePath)) {
      continue;
    }

    // Confirm this is genuinely an incident folder by reading the narrative
    // frontmatter — protects against false positives (e.g. user-created
    // folders that happen to contain a narrative.md from some other context).
    const isIncident = await looksLikeIncidentFolder(narrativePath);
    if (!isIncident) {
      result.skipped.push({
        path: folderPath,
        reason: 'narrative.md present but tier is not "incident-narrative"',
      });
      continue;
    }

    legacyCandidates.push({
      slug: entry.name,
      from: folderPath,
      to: join(vaultRoot, 'incidents', entry.name),
    });
  }

  if (legacyCandidates.length === 0) {
    return result;
  }

  // Build the provenance-rewrite plan FIRST (before moving anything) so
  // we can reason about it. Old refs look like:
  //   `<rel-vault>/2026-04-23-foo/` (no `incidents/`)
  // New refs:
  //   `<rel-vault>/incidents/2026-04-23-foo/`
  const factsDir = join(vaultRoot, 'facts');
  const provenanceRewrites: RewrittenProvenance[] = [];

  if (existsSync(factsDir)) {
    const factFiles = await readdir(factsDir);
    for (const factFile of factFiles) {
      if (!factFile.endsWith('.md')) continue;
      if (factFile === 'INDEX.md') continue;
      const factPath = join(factsDir, factFile);
      const factStat = await stat(factPath);
      if (!factStat.isFile()) continue;

      const factRaw = await readFile(factPath, 'utf-8');
      const factParsed = matter(factRaw);
      const provenance = factParsed.data.provenance;
      if (!Array.isArray(provenance)) continue;

      let didRewrite = false;
      const newProvenance: string[] = [];
      for (const ref of provenance) {
        if (typeof ref !== 'string') {
          newProvenance.push(ref);
          continue;
        }
        let rewritten = ref;
        for (const candidate of legacyCandidates) {
          // Generate possible old-ref shapes and rewrite.
          // - relative from project root: `<rel-vault>/<slug>/`
          // - bare slug + trailing slash: `<slug>/`
          // - bare slug no slash: `<slug>`
          const relOld = `${relative(projectRoot, candidate.from)}/`;
          const relNew = `${relative(projectRoot, candidate.to)}/`;

          if (ref === relOld || ref === relOld.slice(0, -1)) {
            rewritten = relNew;
            break;
          }
          if (ref === `${candidate.slug}/` || ref === candidate.slug) {
            // Bare-slug reference; rewrite to the canonical relative path.
            rewritten = relNew;
            break;
          }
        }
        if (rewritten !== ref) {
          didRewrite = true;
          provenanceRewrites.push({
            factPath,
            oldRef: ref,
            newRef: rewritten,
          });
        }
        newProvenance.push(rewritten);
      }

      if (didRewrite && !dryRun) {
        const newData = { ...factParsed.data, provenance: newProvenance };
        await writeFile(factPath, matter.stringify(factParsed.content, newData), 'utf-8');
      }
    }
  }

  // Now do the actual folder moves (if not dry-run). Ensure incidents/
  // parent dir exists first.
  if (!dryRun) {
    const incidentsParent = join(vaultRoot, 'incidents');
    await mkdir(incidentsParent, { recursive: true });

    for (const candidate of legacyCandidates) {
      // Refuse to clobber an existing folder at the destination.
      if (existsSync(candidate.to)) {
        result.skipped.push({
          path: candidate.from,
          reason: `destination already exists at ${candidate.to}; manual merge required`,
        });
        continue;
      }
      await rename(candidate.from, candidate.to);
      result.moved.push(candidate);
    }
  } else {
    // Dry-run: report what WOULD be moved without doing it.
    for (const candidate of legacyCandidates) {
      if (existsSync(candidate.to)) {
        result.skipped.push({
          path: candidate.from,
          reason: `destination already exists at ${candidate.to}; manual merge required`,
        });
        continue;
      }
      result.moved.push(candidate);
    }
  }

  result.rewrittenProvenance = provenanceRewrites;
  result.action = dryRun
    ? 'dry_run'
    : result.moved.length > 0 || provenanceRewrites.length > 0
      ? 'fixed'
      : 'no_op';

  return result;
}

async function looksLikeIncidentFolder(narrativePath: string): Promise<boolean> {
  try {
    const content = await readFile(narrativePath, 'utf-8');
    const { data } = matter(content);
    return data.tier === 'incident-narrative';
  } catch {
    return false;
  }
}
