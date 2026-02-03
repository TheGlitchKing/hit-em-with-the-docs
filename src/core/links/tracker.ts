import { readFile } from 'fs/promises';
import { relative, dirname, resolve } from 'path';
import { findMarkdownFiles } from '../../utils/glob.js';
import { extractLinks } from '../../utils/markdown.js';
import { detectDomainFromPath } from '../domains/detector.js';
import type { Domain } from '../domains/constants.js';
import { DOMAINS } from '../domains/constants.js';

export interface LinkGraph {
  nodes: LinkNode[];
  edges: LinkEdge[];
}

export interface LinkNode {
  id: string;
  path: string;
  domain: Domain | null;
  title?: string;
  inDegree: number;
  outDegree: number;
}

export interface LinkEdge {
  source: string;
  target: string;
  linkText: string;
  lineNumber: number;
}

export interface DomainConnectionMatrix {
  domains: Domain[];
  matrix: number[][];
  totalConnections: number;
}

/**
 * Build a complete link graph for the documentation
 */
export async function buildLinkGraph(docsPath: string): Promise<LinkGraph> {
  const files = await findMarkdownFiles(docsPath);
  const nodes = new Map<string, LinkNode>();
  const edges: LinkEdge[] = [];

  // First pass: create nodes
  for (const file of files) {
    const relPath = relative(docsPath, file);
    const domain = detectDomainFromPath(file, docsPath).domain;

    nodes.set(relPath, {
      id: relPath,
      path: relPath,
      domain,
      inDegree: 0,
      outDegree: 0,
    });
  }

  // Second pass: find edges and update degrees
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const links = extractLinks(content);
    const relPath = relative(docsPath, file);
    const fileDir = dirname(file);

    for (const link of links) {
      if (link.isInternal) {
        // Resolve the link
        const pathPart = link.url.split('#')[0] ?? '';
        if (!pathPart) continue;

        let targetPath: string;
        if (pathPart.startsWith('/')) {
          targetPath = pathPart.slice(1);
        } else {
          targetPath = relative(docsPath, resolve(fileDir, pathPart));
        }

        // Normalize path separators
        targetPath = targetPath.replace(/\\/g, '/');

        if (nodes.has(targetPath)) {
          edges.push({
            source: relPath,
            target: targetPath,
            linkText: link.text,
            lineNumber: link.lineNumber,
          });

          // Update degrees
          const sourceNode = nodes.get(relPath);
          const targetNode = nodes.get(targetPath);

          if (sourceNode) sourceNode.outDegree++;
          if (targetNode) targetNode.inDegree++;
        }
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
  };
}

/**
 * Build a domain connection matrix showing how domains link to each other
 */
export async function buildDomainConnectionMatrix(
  docsPath: string
): Promise<DomainConnectionMatrix> {
  const graph = await buildLinkGraph(docsPath);

  // Initialize matrix
  const matrix: number[][] = DOMAINS.map(() =>
    DOMAINS.map(() => 0)
  );

  let totalConnections = 0;

  // Count connections between domains
  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);

    if (sourceNode?.domain && targetNode?.domain) {
      const sourceIdx = DOMAINS.indexOf(sourceNode.domain);
      const targetIdx = DOMAINS.indexOf(targetNode.domain);

      if (sourceIdx !== -1 && targetIdx !== -1) {
        matrix[sourceIdx]![targetIdx]!++;
        totalConnections++;
      }
    }
  }

  return {
    domains: [...DOMAINS],
    matrix,
    totalConnections,
  };
}

/**
 * Get top connected domain pairs
 */
export async function getTopConnectedDomains(
  docsPath: string,
  limit: number = 10
): Promise<{ from: Domain; to: Domain; count: number }[]> {
  const { domains, matrix } = await buildDomainConnectionMatrix(docsPath);
  const connections: { from: Domain; to: Domain; count: number }[] = [];

  for (let i = 0; i < domains.length; i++) {
    for (let j = 0; j < domains.length; j++) {
      const count = matrix[i]![j] ?? 0;
      if (count > 0) {
        connections.push({
          from: domains[i]!,
          to: domains[j]!,
          count,
        });
      }
    }
  }

  return connections
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get backlinks for a specific file
 */
export async function getBacklinks(
  targetFile: string,
  docsPath: string
): Promise<{ source: string; linkText: string; lineNumber: number }[]> {
  const graph = await buildLinkGraph(docsPath);
  const targetPath = relative(docsPath, targetFile).replace(/\\/g, '/');

  return graph.edges
    .filter((e) => e.target === targetPath)
    .map((e) => ({
      source: e.source,
      linkText: e.linkText,
      lineNumber: e.lineNumber,
    }));
}

/**
 * Find orphan files (files with no incoming links)
 */
export async function findOrphanFiles(docsPath: string): Promise<string[]> {
  const graph = await buildLinkGraph(docsPath);

  return graph.nodes
    .filter((n) => n.inDegree === 0)
    .filter((n) => {
      // Exclude index files
      const name = n.path.split('/').pop() ?? '';
      return !['INDEX.md', 'REGISTRY.md', 'README.md'].includes(name);
    })
    .map((n) => n.path);
}

/**
 * Find highly connected files (hubs)
 */
export async function findHubFiles(
  docsPath: string,
  minDegree: number = 5
): Promise<LinkNode[]> {
  const graph = await buildLinkGraph(docsPath);

  return graph.nodes
    .filter((n) => n.inDegree >= minDegree || n.outDegree >= minDegree)
    .sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree));
}

/**
 * Get link statistics summary
 */
export async function getLinkStatistics(docsPath: string): Promise<{
  totalNodes: number;
  totalEdges: number;
  avgInDegree: number;
  avgOutDegree: number;
  orphanCount: number;
  hubCount: number;
  crossDomainPercentage: number;
}> {
  const graph = await buildLinkGraph(docsPath);

  const totalInDegree = graph.nodes.reduce((sum, n) => sum + n.inDegree, 0);
  const totalOutDegree = graph.nodes.reduce((sum, n) => sum + n.outDegree, 0);

  const orphans = graph.nodes.filter((n) => n.inDegree === 0).length;
  const hubs = graph.nodes.filter((n) => n.inDegree >= 5 || n.outDegree >= 5).length;

  // Count cross-domain edges
  let crossDomainEdges = 0;
  for (const edge of graph.edges) {
    const sourceNode = graph.nodes.find((n) => n.id === edge.source);
    const targetNode = graph.nodes.find((n) => n.id === edge.target);

    if (sourceNode?.domain && targetNode?.domain && sourceNode.domain !== targetNode.domain) {
      crossDomainEdges++;
    }
  }

  return {
    totalNodes: graph.nodes.length,
    totalEdges: graph.edges.length,
    avgInDegree: graph.nodes.length > 0 ? totalInDegree / graph.nodes.length : 0,
    avgOutDegree: graph.nodes.length > 0 ? totalOutDegree / graph.nodes.length : 0,
    orphanCount: orphans,
    hubCount: hubs,
    crossDomainPercentage:
      graph.edges.length > 0 ? (crossDomainEdges / graph.edges.length) * 100 : 0,
  };
}
