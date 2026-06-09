/**
 * Inbound-link detection for the archival process.
 *
 * Archiving a doc that active docs still link to would turn live references
 * into dead ones — exactly the failure archival must prevent. This reuses the
 * existing link graph (which already excludes `archive/`, since it scans via
 * `findMarkdownFiles`) to find every active doc that links to a target.
 */

import { relative } from 'path';
import { buildLinkGraph } from '../links/tracker.js';

export interface InboundLink {
  /** docs-relative path of the doc that links to the target. */
  source: string;
  lineNumber: number;
  linkText: string;
}

/**
 * Find all active (non-archived) docs that link to `targetRelPath`
 * (a path relative to `docsPath`). Returns one entry per inbound link.
 */
export async function findInboundLinks(
  docsPath: string,
  targetRelPath: string
): Promise<InboundLink[]> {
  const normalizedTarget = targetRelPath.replace(/\\/g, '/');
  const graph = await buildLinkGraph(docsPath);
  return graph.edges
    .filter((e) => e.target.replace(/\\/g, '/') === normalizedTarget)
    .map((e) => ({
      source: e.source.replace(/\\/g, '/'),
      lineNumber: e.lineNumber,
      linkText: e.linkText,
    }));
}

/** Normalize an absolute-or-relative file arg to a docs-relative POSIX path. */
export function toDocsRelative(docsPath: string, file: string): string {
  // If `file` is already relative and doesn't resolve under docsPath, treat it
  // as docs-relative as-is; otherwise compute the relative path.
  const rel = file.includes(docsPath) ? relative(docsPath, file) : file;
  return rel.replace(/\\/g, '/').replace(/^\.\//, '');
}
