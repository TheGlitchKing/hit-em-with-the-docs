/**
 * Archival candidate DETECTION — advisory and read-only.
 *
 * Surfaces docs that *might* warrant archiving, scored on ranked signals.
 * It never moves anything (the executor does that). Philosophy: a strong
 * explicit signal (`status: deprecated`, `superseded_by`) qualifies on its
 * own; age qualifies only in combination with orphaned (`require_orphaned`),
 * because age alone conflates "unchanged" with "obsolete".
 */

import { execFileSync } from 'child_process';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { findMarkdownFiles } from '../../utils/glob.js';
import { parseFrontmatter } from '../../utils/frontmatter.js';
import { buildLinkGraph } from '../links/tracker.js';
import type { ArchiveConfig } from '../../utils/config.js';

export interface ArchiveCandidate {
  file: string; // docs-relative
  score: number;
  reasons: string[];
  signals: {
    deprecated: boolean;
    superseded: boolean;
    orphaned: boolean;
    stale: boolean;
    staleSignalDegraded: boolean; // git unavailable → used last_updated
  };
}

/**
 * Days since the file was last modified, via git (`%cs` = committer date).
 * Returns null when not in a git repo or the file is untracked (no history).
 */
export function gitLastTouchedDays(
  projectRoot: string,
  fileAbs: string,
  today: Date
): number | null {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', fileAbs],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .toString()
      .trim();
    if (!out) return null;
    const then = new Date(out);
    if (Number.isNaN(then.getTime())) return null;
    return Math.floor((today.getTime() - then.getTime()) / 86_400_000);
  } catch {
    return null;
  }
}

/** Days since `last_updated` frontmatter (fallback recency signal). */
function lastUpdatedDays(value: unknown, today: Date): number | null {
  if (!value) return null;
  const then = new Date(String(value));
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((today.getTime() - then.getTime()) / 86_400_000);
}

export interface FindCandidatesInput {
  docsPath: string;
  projectRoot: string;
  config: ArchiveConfig;
  /** Override "today" for deterministic tests. */
  today?: Date;
}

export async function findArchiveCandidates(
  input: FindCandidatesInput
): Promise<ArchiveCandidate[]> {
  const { docsPath, projectRoot, config } = input;
  const today = input.today ?? new Date();

  // Inbound-degree map (archive/ already excluded by findMarkdownFiles).
  const graph = await buildLinkGraph(docsPath);
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) inDegree.set(n.path.replace(/\\/g, '/'), n.inDegree);

  const files = await findMarkdownFiles(docsPath);
  const candidates: ArchiveCandidate[] = [];

  for (const fileAbs of files) {
    const rel = relative(docsPath, fileAbs).replace(/\\/g, '/');
    let raw: string;
    try {
      raw = await readFile(fileAbs, 'utf-8');
    } catch {
      continue;
    }
    const { data } = parseFrontmatter<Record<string, unknown>>(raw);

    const reasons: string[] = [];
    let score = 0;

    const deprecated =
      config.honor_status_deprecated && data.status === 'deprecated';
    if (deprecated) {
      score += 100;
      reasons.push('status: deprecated');
    }

    const superseded =
      typeof data.superseded_by === 'string' && data.superseded_by.length > 0;
    if (superseded) {
      score += 80;
      reasons.push(`superseded_by: ${String(data.superseded_by)}`);
    }

    const orphaned = (inDegree.get(rel) ?? 0) === 0;

    // Recency: prefer git-last-touched; fall back to last_updated.
    let ageDays = gitLastTouchedDays(projectRoot, fileAbs, today);
    let degraded = false;
    if (ageDays === null) {
      ageDays = lastUpdatedDays(data.last_updated, today);
      degraded = true;
    }
    const stale = ageDays !== null && ageDays > config.candidate_after_days;

    // Age only contributes when orphaned (unless require_orphaned disabled).
    const ageQualifies = stale && (orphaned || !config.require_orphaned);
    if (ageQualifies) {
      if (orphaned) {
        score += 30;
        reasons.push('orphaned (no inbound links)');
      }
      score += 10;
      reasons.push(
        `not modified in ${ageDays}d${degraded ? ' (via last_updated — git unavailable)' : ''}`
      );
    }

    const isCandidate = deprecated || superseded || ageQualifies;
    if (isCandidate) {
      candidates.push({
        file: rel,
        score,
        reasons,
        signals: { deprecated, superseded, orphaned, stale, staleSignalDegraded: degraded },
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/** Convenience: resolve absolute docs path for a candidate (test/CLI helper). */
export function candidateAbsPath(docsPath: string, candidate: ArchiveCandidate): string {
  return join(docsPath, candidate.file);
}
