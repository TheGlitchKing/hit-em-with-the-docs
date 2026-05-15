/**
 * Citation graph walker for knowledge-base primitives (2.3.0).
 *
 * Builds the per-fact citation index from three source kinds:
 *   - Facts (`<vault>/facts/<id>.md`) — the canonical fact corpus.
 *   - Incident-facts bridges (`<vault>/incidents/<slug>/facts.md`) — produced /
 *     strengthened / weakened edges.
 *   - Playbooks (any file with `symptoms: [...]` frontmatter) — `cites` edges
 *     from each symptom entry to the facts the playbook step depends on.
 *
 * Used by:
 *   - `facts/INDEX.md` generator (PR2) — to compute citer counts per fact.
 *   - `hewtd find-citers <fact-id>` CLI command (PR3) — typed structure output.
 *   - Dangling-citation linting (future PR) — flags `cites:` pointing at
 *     non-existent facts.
 */

import { readFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

export interface FactRef {
  /** Fact id (from frontmatter `id:`). */
  id: string;
  /** Absolute path to the fact's markdown file. */
  path: string;
  /** Path relative to the project root (for stable, diff-friendly indexes). */
  relPath: string;
  /** Frontmatter title. */
  title: string;
  /** Confidence enum value, if present. */
  confidence: string | undefined;
  /** YYYY-MM-DD or null if missing/malformed. */
  lastVerified: string | undefined;
  /** Tags from frontmatter. */
  tags: string[];
}

export interface IncidentRef {
  /** Incident id (from narrative.md frontmatter `id:`). */
  id: string;
  /** Absolute path to the incident folder. */
  folderPath: string;
  /** Project-relative folder path. */
  relFolderPath: string;
  /** Frontmatter title from narrative.md. */
  title: string;
  /** YYYY-MM-DD. */
  date: string | undefined;
  severity: string | undefined;
  resolution_status: string | undefined;
  components: string[];
  /** Fact ids produced by this incident (from facts.md). */
  produced: string[];
  strengthened: string[];
  weakened: string[];
}

export interface PlaybookCitation {
  /** Project-relative path to the playbook. */
  relPath: string;
  /** Absolute path. */
  path: string;
  /** Frontmatter title. */
  title: string;
  /** Anchor within the playbook (e.g. `#vault-down-auth-staging`). */
  target: string;
  /** Symptom kind that triggered the citation. */
  kind: 'alert_name' | 'user_phrase' | 'error_pattern';
  /** The matching key (string or array, depending on kind). */
  key: string | string[];
  severity: string | undefined;
}

export interface CiterIndex {
  /** All discovered facts, keyed by id. */
  facts: Map<string, FactRef>;
  /** All discovered incident folders, keyed by id. */
  incidents: Map<string, IncidentRef>;
  /**
   * Citation edges per fact id. A fact id appearing here may not have a
   * matching entry in `facts` — that's a dangling citation, detected by
   * the caller.
   */
  citers: Map<string, PlaybookCitation[]>;
}

/**
 * Typed structure returned by `findCiters(factId)`. Matches the shape the
 * `hewtd find-citers` CLI command will print and the structure documented
 * in `docs/knowledge-base-primitives.md`.
 */
export interface FindCitersResult {
  fact_id: string;
  fact_exists: boolean;
  citers: string[]; // playbook relative paths
  incidents_produced_in: string[]; // incident ids
  incidents_strengthened_by: string[];
  incidents_weakened_by: string[];
}

export interface BuildCiterIndexOptions {
  /** Absolute path to the project root. */
  projectRoot: string;
  /** Absolute path to the vault root (default config: <root>/.documentation/knowledge-base/). */
  vaultRoot: string;
  /**
   * Glob patterns (absolute, project-rooted) used to scan playbooks for
   * `symptoms:` frontmatter blocks. The walker filters by frontmatter
   * presence — files without a `symptoms:` block are skipped quickly.
   */
  playbookGlobs: string[];
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isString);

/**
 * Walk the corpus and build a citer index. Designed to be cheap on no-vault
 * trees: if the vault root doesn't exist, returns an empty index without
 * scanning playbooks for symptoms (no point — no facts to cite).
 */
export async function buildCiterIndex(
  options: BuildCiterIndexOptions
): Promise<CiterIndex> {
  const { projectRoot, vaultRoot, playbookGlobs } = options;

  const facts = new Map<string, FactRef>();
  const incidents = new Map<string, IncidentRef>();
  const citers = new Map<string, PlaybookCitation[]>();

  // ----- Facts -----
  const factFiles = await glob(join(vaultRoot, 'facts/*.md'), {
    nodir: true,
    absolute: true,
  });
  for (const factPath of factFiles) {
    const ref = await readFactRef(factPath, projectRoot);
    if (ref) facts.set(ref.id, ref);
  }

  // ----- Incidents -----
  const narrativeFiles = await glob(
    join(vaultRoot, 'incidents/*/narrative.md'),
    { nodir: true, absolute: true }
  );
  for (const narrativePath of narrativeFiles) {
    const ref = await readIncidentRef(narrativePath, projectRoot);
    if (ref) incidents.set(ref.id, ref);
  }

  // Short-circuit: if no facts and no incidents, no point scanning playbooks.
  if (facts.size === 0 && incidents.size === 0) {
    return { facts, incidents, citers };
  }

  // ----- Playbook citations -----
  // Cheap pre-filter: read each candidate file and skip if frontmatter has
  // no `symptoms` key. Avoids paying for full YAML parse on every doc.
  const playbookCandidates = new Set<string>();
  for (const pattern of playbookGlobs) {
    const matches = await glob(pattern, { nodir: true, absolute: true });
    for (const m of matches) playbookCandidates.add(m);
  }

  for (const playbookPath of playbookCandidates) {
    const cits = await extractPlaybookCitations(playbookPath, projectRoot);
    for (const c of cits) {
      // Each citation has a list of fact ids implicit in the symptoms entry.
      const factIds = c.factIds;
      for (const factId of factIds) {
        const existing = citers.get(factId) ?? [];
        existing.push(c.citation);
        citers.set(factId, existing);
      }
    }
  }

  return { facts, incidents, citers };
}

async function readFactRef(
  path: string,
  projectRoot: string
): Promise<FactRef | null> {
  try {
    const content = await readFile(path, 'utf-8');
    const { data } = matter(content);
    if (data.tier !== 'fact' || !isString(data.id)) return null;

    const tags = isStringArray(data.tags) ? data.tags : [];
    const lastVerified = normalizeDate(data.last_verified);

    return {
      id: data.id,
      path,
      relPath: relative(projectRoot, path),
      title: isString(data.title) ? data.title : data.id,
      confidence: isString(data.confidence) ? data.confidence : undefined,
      lastVerified,
      tags,
    };
  } catch {
    return null;
  }
}

async function readIncidentRef(
  narrativePath: string,
  projectRoot: string
): Promise<IncidentRef | null> {
  try {
    const narrativeContent = await readFile(narrativePath, 'utf-8');
    const { data: narrative } = matter(narrativeContent);
    if (narrative.tier !== 'incident-narrative' || !isString(narrative.id)) {
      return null;
    }

    const folderPath = resolve(narrativePath, '..');
    const factsMdPath = join(folderPath, 'facts.md');

    let produced: string[] = [];
    let strengthened: string[] = [];
    let weakened: string[] = [];
    try {
      const factsContent = await readFile(factsMdPath, 'utf-8');
      const { data: facts } = matter(factsContent);
      if (facts.tier === 'incident-facts') {
        if (isStringArray(facts.produced)) produced = facts.produced;
        if (isStringArray(facts.strengthened)) strengthened = facts.strengthened;
        if (isStringArray(facts.weakened)) weakened = facts.weakened;
      }
    } catch {
      // facts.md missing — incident has no produced/strengthened/weakened edges
    }

    return {
      id: narrative.id,
      folderPath,
      relFolderPath: relative(projectRoot, folderPath),
      title: isString(narrative.title) ? narrative.title : narrative.id,
      date: normalizeDate(narrative.date),
      severity: isString(narrative.severity) ? narrative.severity : undefined,
      resolution_status: isString(narrative.resolution_status)
        ? narrative.resolution_status
        : undefined,
      components: isStringArray(narrative.components) ? narrative.components : [],
      produced,
      strengthened,
      weakened,
    };
  } catch {
    return null;
  }
}

interface PlaybookCitationWithFacts {
  citation: PlaybookCitation;
  factIds: string[];
}

async function extractPlaybookCitations(
  playbookPath: string,
  projectRoot: string
): Promise<PlaybookCitationWithFacts[]> {
  try {
    const content = await readFile(playbookPath, 'utf-8');
    const { data } = matter(content);
    if (!Array.isArray(data.symptoms) || data.symptoms.length === 0) {
      return [];
    }

    const title = isString(data.title) ? data.title : playbookPath;
    const results: PlaybookCitationWithFacts[] = [];

    for (const sym of data.symptoms) {
      const s = sym as Record<string, unknown>;
      if (!isString(s.target) || !isStringArray(s.cites)) continue;

      let kind: PlaybookCitation['kind'];
      let key: string | string[];
      if (isString(s.alert_name)) {
        kind = 'alert_name';
        key = s.alert_name;
      } else if (isStringArray(s.user_phrase) || isString(s.user_phrase)) {
        kind = 'user_phrase';
        key = s.user_phrase as string | string[];
      } else if (isString(s.error_pattern)) {
        kind = 'error_pattern';
        key = s.error_pattern;
      } else {
        continue; // malformed — caught by audit-strict, ignored here
      }

      results.push({
        citation: {
          relPath: relative(projectRoot, playbookPath),
          path: playbookPath,
          title,
          target: s.target,
          kind,
          key,
          severity: isString(s.severity) ? s.severity : undefined,
        },
        factIds: s.cites,
      });
    }

    return results;
  } catch {
    return [];
  }
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

/**
 * Public lookup: typed structure for one fact id. Matches the shape the
 * `hewtd find-citers` CLI command prints.
 */
export function findCitersInIndex(
  index: CiterIndex,
  factId: string
): FindCitersResult {
  // Dedup citers by playbook relPath — multiple symptoms entries in the same
  // playbook citing the same fact count as ONE citer.
  const citerSet = new Set<string>();
  for (const c of index.citers.get(factId) ?? []) {
    citerSet.add(c.relPath);
  }

  const incidents_produced_in: string[] = [];
  const incidents_strengthened_by: string[] = [];
  const incidents_weakened_by: string[] = [];
  for (const inc of index.incidents.values()) {
    if (inc.produced.includes(factId)) incidents_produced_in.push(inc.id);
    if (inc.strengthened.includes(factId)) incidents_strengthened_by.push(inc.id);
    if (inc.weakened.includes(factId)) incidents_weakened_by.push(inc.id);
  }

  return {
    fact_id: factId,
    fact_exists: index.facts.has(factId),
    citers: [...citerSet].sort(),
    incidents_produced_in: incidents_produced_in.sort(),
    incidents_strengthened_by: incidents_strengthened_by.sort(),
    incidents_weakened_by: incidents_weakened_by.sort(),
  };
}

/**
 * Count distinct citers for a fact id. Used by the facts-index generator.
 */
export function citerCount(index: CiterIndex, factId: string): number {
  const list = index.citers.get(factId);
  if (!list) return 0;
  // Distinct by playbook relPath (multiple symptoms in the same playbook
  // citing the same fact count once).
  const seen = new Set<string>();
  for (const c of list) seen.add(c.relPath);
  return seen.size;
}
