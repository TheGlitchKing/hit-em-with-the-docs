import { readFile } from 'fs/promises';
import { relative, basename } from 'path';
import { findMarkdownFiles } from '../../utils/glob.js';
import { parseFrontmatter } from '../../utils/frontmatter.js';
import { logger } from '../../utils/logger.js';
import {
  validatePartialMetadata,
  getMissingRequiredFields,
  type PartialDocumentMetadata,
} from '../metadata/schema.js';
import { detectDomainFromPath } from '../domains/detector.js';
import { isValidTier } from '../domains/classifier.js';
import { isValidDomain } from '../domains/constants.js';
import { checkNamingConvention, checkFilePlacement } from './rules.js';

export interface AuditOptions {
  docsPath: string;
  domain?: string;
  issuesOnly?: boolean;
  silent?: boolean;
}

export interface AuditResult {
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  issues: AuditIssue[];
  stats: AuditStats;
  healthScore: number;
}

export interface AuditIssue {
  file: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  fixable: boolean;
  suggestion?: string;
}

export interface AuditStats {
  metadataCompliance: number;
  namingCompliance: number;
  placementCompliance: number;
  tagConsistency: number;
  byDomain: Record<string, DomainAuditStats>;
}

export interface DomainAuditStats {
  files: number;
  issues: number;
  healthScore: number;
}

/**
 * Audit documentation for compliance and issues
 */
export async function auditDocumentation(options: AuditOptions): Promise<AuditResult> {
  const {
    docsPath,
    domain,
    issuesOnly = false,
    silent = false,
  } = options;

  const result: AuditResult = {
    totalFiles: 0,
    passedFiles: 0,
    failedFiles: 0,
    issues: [],
    stats: {
      metadataCompliance: 0,
      namingCompliance: 0,
      placementCompliance: 0,
      tagConsistency: 0,
      byDomain: {},
    },
    healthScore: 0,
  };

  if (!silent) {
    logger.header('Documentation Audit');
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

  // Exclude system files
  files = files.filter((f) => {
    const name = basename(f);
    return !['INDEX.md', 'REGISTRY.md'].includes(name);
  });

  result.totalFiles = files.length;

  if (!silent) {
    logger.info(`Auditing ${files.length} files...`);
  }

  let metadataCompliant = 0;
  let namingCompliant = 0;
  let placementCompliant = 0;
  const tagCounts = new Map<string, number>();

  for (const file of files) {
    const fileIssues = await auditFile(file, docsPath);

    // Track per-file results
    const hasErrors = fileIssues.some((i) => i.severity === 'error');

    if (hasErrors) {
      result.failedFiles++;
    } else {
      result.passedFiles++;
    }

    // Add issues
    if (!issuesOnly || fileIssues.length > 0) {
      result.issues.push(...fileIssues);
    }

    // Update compliance stats
    const hasMetadataIssue = fileIssues.some((i) => i.rule.startsWith('metadata'));
    const hasNamingIssue = fileIssues.some((i) => i.rule === 'naming-convention');
    const hasPlacementIssue = fileIssues.some((i) => i.rule === 'placement');

    if (!hasMetadataIssue) metadataCompliant++;
    if (!hasNamingIssue) namingCompliant++;
    if (!hasPlacementIssue) placementCompliant++;

    // Track tags for consistency check
    try {
      const content = await readFile(file, 'utf-8');
      const { data } = parseFrontmatter<PartialDocumentMetadata>(content);
      if (data.tags) {
        for (const tag of data.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }

      // Track by domain
      const fileDomain = data.domains?.[0] ?? detectDomainFromPath(file, docsPath).domain ?? 'unknown';
      if (!result.stats.byDomain[fileDomain]) {
        result.stats.byDomain[fileDomain] = { files: 0, issues: 0, healthScore: 0 };
      }
      result.stats.byDomain[fileDomain]!.files++;
      result.stats.byDomain[fileDomain]!.issues += fileIssues.length;
    } catch {
      // Ignore read errors
    }
  }

  // Calculate stats
  result.stats.metadataCompliance = (metadataCompliant / files.length) * 100 || 0;
  result.stats.namingCompliance = (namingCompliant / files.length) * 100 || 0;
  result.stats.placementCompliance = (placementCompliant / files.length) * 100 || 0;

  // Tag consistency: percentage of tags used more than once
  const tagsUsedMultiple = [...tagCounts.values()].filter((c) => c > 1).length;
  result.stats.tagConsistency = tagCounts.size > 0
    ? (tagsUsedMultiple / tagCounts.size) * 100
    : 100;

  // Calculate per-domain health scores
  for (const stats of Object.values(result.stats.byDomain)) {
    const avgIssuesPerFile = stats.issues / stats.files;
    stats.healthScore = Math.max(0, 100 - avgIssuesPerFile * 10);
  }

  // Calculate overall health score
  result.healthScore =
    (result.stats.metadataCompliance * 0.4) +
    (result.stats.namingCompliance * 0.2) +
    (result.stats.placementCompliance * 0.2) +
    (result.stats.tagConsistency * 0.2);

  if (!silent) {
    logger.newline();
    logger.success(`Audit complete!`);
    logger.info(`Passed: ${result.passedFiles}/${result.totalFiles}`);
    logger.info(`Health Score: ${result.healthScore.toFixed(1)}/100`);
    if (result.issues.length > 0) {
      const errors = result.issues.filter((i) => i.severity === 'error').length;
      const warnings = result.issues.filter((i) => i.severity === 'warning').length;
      logger.warn(`Issues: ${errors} errors, ${warnings} warnings`);
    }
  }

  return result;
}

/**
 * Audit a single file
 */
async function auditFile(filePath: string, docsPath: string): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  const relPath = relative(docsPath, filePath);

  try {
    const content = await readFile(filePath, 'utf-8');
    const { data } = parseFrontmatter<PartialDocumentMetadata>(content);

    // Check metadata presence
    const missingRequired = getMissingRequiredFields(data as Record<string, unknown>);
    if (missingRequired.length > 0) {
      issues.push({
        file: relPath,
        rule: 'metadata-required',
        severity: 'error',
        message: `Missing required fields: ${missingRequired.join(', ')}`,
        fixable: true,
        suggestion: 'Run with --fix to auto-generate missing metadata',
      });
    }

    // Check metadata validity
    const validation = validatePartialMetadata(data);
    if (!validation.valid) {
      for (const error of validation.errors) {
        issues.push({
          file: relPath,
          rule: 'metadata-invalid',
          severity: 'error',
          message: error,
          fixable: false,
        });
      }
    }

    // Check tier validity
    if (data.tier && !isValidTier(data.tier)) {
      issues.push({
        file: relPath,
        rule: 'metadata-tier',
        severity: 'error',
        message: `Invalid tier: ${data.tier}`,
        fixable: true,
        suggestion: 'Valid tiers: guide, standard, example, reference, admin',
      });
    }

    // Check domain validity
    if (data.domains) {
      for (const d of data.domains) {
        if (!isValidDomain(d)) {
          issues.push({
            file: relPath,
            rule: 'metadata-domain',
            severity: 'warning',
            message: `Unknown domain: ${d}`,
            fixable: false,
            suggestion: 'Consider using a standard domain or adding this as a custom domain',
          });
        }
      }
    }

    // Check naming convention
    const namingResult = checkNamingConvention(filePath);
    if (!namingResult.valid) {
      const namingIssue: AuditIssue = {
        file: relPath,
        rule: 'naming-convention',
        severity: 'warning',
        message: namingResult.message ?? 'Naming convention violation',
        fixable: false,
      };
      if (namingResult.suggestion) {
        namingIssue.suggestion = namingResult.suggestion;
      }
      issues.push(namingIssue);
    }

    // Check file placement
    const placementResult = checkFilePlacement(filePath, docsPath, data.domains?.[0]);
    if (!placementResult.valid) {
      const placementIssue: AuditIssue = {
        file: relPath,
        rule: 'placement',
        severity: 'warning',
        message: placementResult.message ?? 'File may be in wrong domain',
        fixable: false,
      };
      if (placementResult.suggestion) {
        placementIssue.suggestion = placementResult.suggestion;
      }
      issues.push(placementIssue);
    }

    // Check for stale content
    if (data.last_updated) {
      const lastUpdated = new Date(data.last_updated);
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate > 365) {
        issues.push({
          file: relPath,
          rule: 'stale-content',
          severity: 'info',
          message: `Document not updated in ${Math.floor(daysSinceUpdate)} days`,
          fixable: false,
          suggestion: 'Consider reviewing and updating this document',
        });
      }
    }

    // Check for empty tags
    if (data.tags && data.tags.length === 0 && data.status === 'active') {
      issues.push({
        file: relPath,
        rule: 'missing-tags',
        severity: 'info',
        message: 'Active document has no tags',
        fixable: true,
        suggestion: 'Add relevant tags for better discoverability',
      });
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      file: relPath,
      rule: 'read-error',
      severity: 'error',
      message: `Could not read file: ${message}`,
      fixable: false,
    });
  }

  return issues;
}

/**
 * Get audit summary for a domain
 */
export async function getAuditSummaryForDomain(
  docsPath: string,
  domain: string
): Promise<DomainAuditStats> {
  const result = await auditDocumentation({
    docsPath,
    domain,
    silent: true,
  });

  return result.stats.byDomain[domain] ?? { files: 0, issues: 0, healthScore: 100 };
}
