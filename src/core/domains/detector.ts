import { basename, relative } from 'path';
import {
  Domain,
  DOMAINS,
  DOMAIN_DEFINITIONS,
  getAllKeywords,
  isValidDomain,
} from './constants.js';

export interface DomainDetectionResult {
  domain: Domain | null;
  confidence: number; // 0-1
  method: 'path' | 'content' | 'keywords' | 'none';
  alternativeDomains: { domain: Domain; confidence: number }[];
}

/**
 * Detect domain from file path and/or content
 */
export function detectDomain(
  filePath: string,
  content?: string,
  docsRoot: string = '.documentation'
): DomainDetectionResult {
  // Priority 1: Path-based detection (highest confidence)
  const pathResult = detectDomainFromPath(filePath, docsRoot);
  if (pathResult.domain && pathResult.confidence >= 0.9) {
    return pathResult;
  }

  // Priority 2: Content-based detection (if provided)
  if (content) {
    const contentResult = detectDomainFromContent(content);

    // If path gave a lower confidence match, compare with content
    if (pathResult.domain) {
      if (contentResult.confidence > pathResult.confidence) {
        // Content wins but add path result as alternative
        contentResult.alternativeDomains.unshift({
          domain: pathResult.domain,
          confidence: pathResult.confidence,
        });
        return contentResult;
      }
      // Path wins
      return pathResult;
    }

    return contentResult;
  }

  // Return path result even if low confidence
  return pathResult;
}

/**
 * Detect domain from file path
 */
export function detectDomainFromPath(
  filePath: string,
  docsRoot: string = '.documentation'
): DomainDetectionResult {
  const result: DomainDetectionResult = {
    domain: null,
    confidence: 0,
    method: 'path',
    alternativeDomains: [],
  };

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedRoot = docsRoot.replace(/\\/g, '/');

  // Try to get relative path from docs root
  let relativePath: string;
  try {
    relativePath = relative(normalizedRoot, normalizedPath).replace(/\\/g, '/');
  } catch {
    relativePath = normalizedPath;
  }

  // Check if path contains a domain folder
  const parts = relativePath.split('/');

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part && isValidDomain(part)) {
      result.domain = part;
      // Higher confidence if domain is early in path
      result.confidence = i === 0 ? 1.0 : 0.9 - i * 0.1;
      break;
    }
  }

  // Also check filename for domain hints
  if (!result.domain) {
    const fileName = basename(filePath, '.md');
    for (const domain of DOMAINS) {
      if (fileName.includes(domain)) {
        result.domain = domain;
        result.confidence = 0.6;
        break;
      }
    }
  }

  return result;
}

/**
 * Detect domain from document content
 */
export function detectDomainFromContent(content: string): DomainDetectionResult {
  const result: DomainDetectionResult = {
    domain: null,
    confidence: 0,
    method: 'content',
    alternativeDomains: [],
  };

  const lowerContent = content.toLowerCase();
  const keywordMap = getAllKeywords();

  // Count keyword matches per domain
  const domainScores = new Map<Domain, number>();

  for (const [keyword, domains] of keywordMap) {
    // Count occurrences of keyword
    const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi');
    const matches = lowerContent.match(regex);
    if (matches) {
      const count = matches.length;
      for (const domain of domains) {
        const current = domainScores.get(domain) ?? 0;
        domainScores.set(domain, current + count);
      }
    }
  }

  // Sort domains by score
  const sortedDomains = [...domainScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sortedDomains.length > 0) {
    const maxScore = sortedDomains[0]![1];
    const topDomain = sortedDomains[0]![0];

    // Calculate confidence based on score and score difference from second place
    const secondScore = sortedDomains[1]?.[1] ?? 0;
    const scoreDiff = maxScore - secondScore;
    const normalizedScore = Math.min(maxScore / 20, 1); // Normalize to 0-1
    const scoreDiffFactor = Math.min(scoreDiff / 10, 0.3);

    result.domain = topDomain;
    result.confidence = Math.min(0.5 + normalizedScore * 0.3 + scoreDiffFactor, 0.95);
    result.method = 'keywords';

    // Add alternatives
    for (let i = 1; i < Math.min(sortedDomains.length, 4); i++) {
      const [domain, score] = sortedDomains[i]!;
      result.alternativeDomains.push({
        domain,
        confidence: (score / maxScore) * result.confidence * 0.8,
      });
    }
  }

  return result;
}

/**
 * Get suggested domains for a file based on its name
 */
export function suggestDomainsForFile(fileName: string): Domain[] {
  const baseName = basename(fileName, '.md').toLowerCase();
  const suggestions: Domain[] = [];

  // Check each domain's keywords against the filename
  for (const domain of DOMAINS) {
    const def = DOMAIN_DEFINITIONS[domain];
    for (const keyword of def.keywords) {
      if (baseName.includes(keyword.replace(/-/g, ''))) {
        if (!suggestions.includes(domain)) {
          suggestions.push(domain);
        }
        break;
      }
    }
  }

  // Also check if domain name is in filename
  for (const domain of DOMAINS) {
    if (baseName.includes(domain) && !suggestions.includes(domain)) {
      suggestions.unshift(domain);
    }
  }

  return suggestions;
}

/**
 * Validate that a file is in the correct domain
 */
export function validateDomainPlacement(
  filePath: string,
  docsRoot: string = '.documentation'
): { isCorrect: boolean; currentDomain: Domain | null; suggestedDomain: Domain | null } {
  // Get the domain from the path
  const pathResult = detectDomainFromPath(filePath, docsRoot);

  // Read the file content would be needed here for full validation
  // For now, just return the path-based result
  return {
    isCorrect: pathResult.confidence >= 0.8,
    currentDomain: pathResult.domain,
    suggestedDomain: pathResult.domain,
  };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
