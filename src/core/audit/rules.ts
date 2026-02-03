import { basename, relative } from 'path';
import { detectDomainFromPath } from '../domains/detector.js';
import { isValidDomain } from '../domains/constants.js';

export interface AuditRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  check: (filePath: string, docsPath: string) => RuleCheckResult;
}

export interface RuleCheckResult {
  valid: boolean;
  message?: string;
  suggestion?: string;
}

/**
 * Check if file name follows naming convention (kebab-case)
 */
export function checkNamingConvention(filePath: string): RuleCheckResult {
  const fileName = basename(filePath, '.md');

  // Allow special files
  if (['INDEX', 'REGISTRY', 'README', 'CHANGELOG', 'CONTRIBUTING'].includes(fileName)) {
    return { valid: true };
  }

  // Check for kebab-case
  const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

  if (!kebabCaseRegex.test(fileName)) {
    // Determine what's wrong
    const issues: string[] = [];

    if (/[A-Z]/.test(fileName)) {
      issues.push('contains uppercase letters');
    }
    if (/_/.test(fileName)) {
      issues.push('contains underscores');
    }
    if (/\s/.test(fileName)) {
      issues.push('contains spaces');
    }
    if (/^[0-9]/.test(fileName)) {
      issues.push('starts with a number');
    }
    if (/--/.test(fileName)) {
      issues.push('contains consecutive hyphens');
    }

    const suggestion = fileName
      .toLowerCase()
      .replace(/[_\s]+/g, '-')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      valid: false,
      message: `File name ${issues.join(', ')}`,
      suggestion: `Rename to: ${suggestion}.md`,
    };
  }

  return { valid: true };
}

/**
 * Check if file is in the correct domain folder
 */
export function checkFilePlacement(
  filePath: string,
  docsPath: string,
  declaredDomain?: string
): RuleCheckResult {
  const detectedResult = detectDomainFromPath(filePath, docsPath);
  const detectedDomain = detectedResult.domain;

  // If no domain detected from path, and no domain declared, it's an issue
  if (!detectedDomain && !declaredDomain) {
    return {
      valid: false,
      message: 'File is not in a domain folder',
      suggestion: 'Move file to appropriate domain folder (e.g., security/, api/, etc.)',
    };
  }

  // If domain is declared but file is in different folder
  if (declaredDomain && detectedDomain && declaredDomain !== detectedDomain) {
    return {
      valid: false,
      message: `File declares domain '${declaredDomain}' but is in '${detectedDomain}/' folder`,
      suggestion: `Move to ${declaredDomain}/ or update domains in frontmatter`,
    };
  }

  // If file is in root (not in any domain folder)
  if (!detectedDomain) {
    const rel = relative(docsPath, filePath);
    const pathParts = rel.split(/[/\\]/);

    // Check if it's in root
    if (pathParts.length === 1) {
      return {
        valid: false,
        message: 'File is in documentation root, not in a domain folder',
        suggestion: declaredDomain
          ? `Move to ${declaredDomain}/`
          : 'Move file to appropriate domain folder',
      };
    }

    // Check if it's in an unknown folder
    const folder = pathParts[0];
    if (folder && !isValidDomain(folder) && !['drafts', 'reports'].includes(folder)) {
      return {
        valid: false,
        message: `File is in unknown folder '${folder}'`,
        suggestion: 'Move to a standard domain folder or add as custom domain',
      };
    }
  }

  return { valid: true };
}

/**
 * Check file size is within acceptable range
 */
export function checkFileSize(
  _filePath: string,
  fileSize: number,
  tier?: string
): RuleCheckResult {
  const sizeKB = fileSize / 1024;

  // Size limits by tier
  const limits: Record<string, { min: number; max: number }> = {
    guide: { min: 1, max: 50 },
    standard: { min: 1, max: 30 },
    example: { min: 0.5, max: 20 },
    reference: { min: 5, max: 100 },
    admin: { min: 1, max: 40 },
  };

  const limit = tier && limits[tier] ? limits[tier] : { min: 0.5, max: 100 };

  if (sizeKB < limit.min) {
    return {
      valid: false,
      message: `File is very small (${sizeKB.toFixed(1)} KB)`,
      suggestion: 'Consider adding more content or merging with related document',
    };
  }

  if (sizeKB > limit.max) {
    return {
      valid: false,
      message: `File is very large (${sizeKB.toFixed(1)} KB)`,
      suggestion: 'Consider splitting into multiple documents',
    };
  }

  return { valid: true };
}

/**
 * Check for required sections based on tier
 */
export function checkRequiredSections(
  content: string,
  tier?: string
): RuleCheckResult {
  const requiredSections: Record<string, string[]> = {
    guide: ['overview', 'prerequisites', 'steps'],
    standard: ['rules', 'examples'],
    example: ['code', 'explanation'],
    reference: ['api', 'parameters'],
    admin: ['configuration', 'procedures'],
  };

  if (!tier || !requiredSections[tier]) {
    return { valid: true };
  }

  const lowerContent = content.toLowerCase();
  const sections = requiredSections[tier]!;
  const missingSections: string[] = [];

  for (const section of sections) {
    // Check for heading containing the section name
    const patterns = [
      new RegExp(`^#+\\s*${section}`, 'mi'),
      new RegExp(`^#+\\s*.*${section}`, 'mi'),
    ];

    const found = patterns.some((p) => p.test(lowerContent));
    if (!found) {
      missingSections.push(section);
    }
  }

  if (missingSections.length > 0) {
    return {
      valid: false,
      message: `Missing recommended sections for ${tier}: ${missingSections.join(', ')}`,
      suggestion: `Consider adding sections: ${missingSections.map((s) => `## ${capitalize(s)}`).join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Check for broken relative links within content
 */
export function checkRelativeLinks(
  content: string,
  _filePath: string
): RuleCheckResult {
  // Extract markdown links
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const suspiciousLinks: string[] = [];

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[2] ?? '';

    // Check for common issues in relative links
    if (url.startsWith('/') && !url.startsWith('/http')) {
      // Absolute path from docs root - might be wrong
      if (url.includes('..')) {
        suspiciousLinks.push(url);
      }
    }

    // Check for Windows-style paths
    if (url.includes('\\')) {
      suspiciousLinks.push(url);
    }

    // Check for links with spaces not encoded
    if (url.includes(' ') && !url.includes('%20')) {
      suspiciousLinks.push(url);
    }
  }

  if (suspiciousLinks.length > 0) {
    return {
      valid: false,
      message: `Found ${suspiciousLinks.length} suspicious links`,
      suggestion: 'Review and fix link paths',
    };
  }

  return { valid: true };
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * All built-in audit rules
 */
export const AUDIT_RULES: AuditRule[] = [
  {
    id: 'naming-convention',
    name: 'Naming Convention',
    description: 'Check if file names follow kebab-case convention',
    severity: 'warning',
    check: (filePath) => checkNamingConvention(filePath),
  },
  {
    id: 'placement',
    name: 'File Placement',
    description: 'Check if files are in the correct domain folders',
    severity: 'warning',
    check: (filePath, docsPath) => checkFilePlacement(filePath, docsPath),
  },
];
