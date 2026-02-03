import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { glob, pathExists } from '../../utils/glob.js';
import { logger } from '../../utils/logger.js';

export interface DependencyAnalysisOptions {
  rootPath: string;
  silent?: boolean;
}

export interface DependencyAnalysis {
  packages: PackageAnalysis;
  modules: ModuleAnalysis;
  security: SecurityAnalysis;
  unused: UnusedDependency[];
}

export interface PackageAnalysis {
  total: number;
  production: number;
  development: number;
  dependencies: PackageInfo[];
  devDependencies: PackageInfo[];
}

export interface PackageInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
  outdated?: boolean;
  latestVersion?: string;
}

export interface ModuleAnalysis {
  totalFiles: number;
  imports: number;
  circularDependencies: CircularDependency[];
  highCoupling: HighCouplingModule[];
}

export interface CircularDependency {
  files: string[];
}

export interface HighCouplingModule {
  file: string;
  imports: number;
  importedBy: number;
}

export interface SecurityAnalysis {
  vulnerabilities: SecurityVulnerability[];
}

export interface SecurityVulnerability {
  package: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  recommendation: string;
}

export interface UnusedDependency {
  name: string;
  type: 'production' | 'development';
  reason: string;
}

/**
 * Analyze project dependencies
 */
export async function analyzeDependencies(
  options: DependencyAnalysisOptions
): Promise<DependencyAnalysis> {
  const { rootPath, silent = false } = options;

  if (!silent) {
    logger.header('Dependency Analysis');
    logger.info(`Analyzing: ${rootPath}`);
  }

  // Analyze package.json dependencies
  const packages = await analyzePackages(rootPath);

  if (!silent) {
    logger.info(`Found ${packages.total} packages (${packages.production} prod, ${packages.development} dev)`);
  }

  // Analyze module imports
  const modules = await analyzeModules(rootPath);

  if (!silent) {
    logger.info(`Analyzed ${modules.totalFiles} files, ${modules.imports} imports`);
    if (modules.circularDependencies.length > 0) {
      logger.warn(`Found ${modules.circularDependencies.length} circular dependencies`);
    }
  }

  // Check for security issues (basic check)
  const security = await analyzeSecurityBasic(packages);

  // Find unused dependencies
  const unused = await findUnusedDependencies(rootPath, packages);

  if (!silent && unused.length > 0) {
    logger.warn(`Found ${unused.length} potentially unused dependencies`);
  }

  return {
    packages,
    modules,
    security,
    unused,
  };
}

/**
 * Analyze package.json
 */
async function analyzePackages(rootPath: string): Promise<PackageAnalysis> {
  const result: PackageAnalysis = {
    total: 0,
    production: 0,
    development: 0,
    dependencies: [],
    devDependencies: [],
  };

  const packageJsonPath = join(rootPath, 'package.json');

  if (!(await pathExists(packageJsonPath))) {
    return result;
  }

  try {
    const content = await readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    // Production dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        result.dependencies.push({
          name,
          version: String(version),
          type: 'production',
        });
      }
      result.production = result.dependencies.length;
    }

    // Dev dependencies
    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        result.devDependencies.push({
          name,
          version: String(version),
          type: 'development',
        });
      }
      result.development = result.devDependencies.length;
    }

    result.total = result.production + result.development;
  } catch {
    // Invalid package.json
  }

  return result;
}

/**
 * Analyze module imports and dependencies
 */
async function analyzeModules(rootPath: string): Promise<ModuleAnalysis> {
  const result: ModuleAnalysis = {
    totalFiles: 0,
    imports: 0,
    circularDependencies: [],
    highCoupling: [],
  };

  // Find all source files
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: rootPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });

  result.totalFiles = files.length;

  // Build import graph
  const importGraph = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();

  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const relPath = relative(rootPath, file);

      // Extract imports
      const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
      const imports = new Set<string>();

      for (const match of importMatches) {
        const importPath = match[1];
        if (importPath?.startsWith('.')) {
          // Resolve relative import
          const resolved = resolveImport(relPath, importPath);
          imports.add(resolved);
          result.imports++;

          // Track imported by
          if (!importedBy.has(resolved)) {
            importedBy.set(resolved, new Set());
          }
          importedBy.get(resolved)!.add(relPath);
        }
      }

      importGraph.set(relPath, imports);
    } catch {
      // Skip unreadable files
    }
  }

  // Detect circular dependencies
  result.circularDependencies = detectCircularDependencies(importGraph);

  // Find high coupling modules
  for (const [file, imports] of importGraph) {
    const importCount = imports.size;
    const importedByCount = importedBy.get(file)?.size ?? 0;

    if (importCount > 10 || importedByCount > 10) {
      result.highCoupling.push({
        file,
        imports: importCount,
        importedBy: importedByCount,
      });
    }
  }

  // Sort by total coupling
  result.highCoupling.sort((a, b) =>
    (b.imports + b.importedBy) - (a.imports + a.importedBy)
  );

  return result;
}

/**
 * Resolve relative import path
 */
function resolveImport(fromFile: string, importPath: string): string {
  const fromDir = fromFile.split('/').slice(0, -1).join('/');
  const parts = importPath.split('/');
  const result: string[] = fromDir ? fromDir.split('/') : [];

  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      result.pop();
    } else {
      result.push(part);
    }
  }

  let resolved = result.join('/');

  // Add extension if not present
  if (!resolved.match(/\.[jt]sx?$/)) {
    resolved += '.ts';
  }

  return resolved;
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies(
  graph: Map<string, Set<string>>
): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    if (recursionStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push({ files: path.slice(cycleStart) });
      }
      return true;
    }

    if (visited.has(node)) {
      return false;
    }

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const imports = graph.get(node) ?? new Set();
    for (const imported of imports) {
      dfs(imported, [...path]);
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  // Deduplicate cycles (same cycle can be detected from different starting points)
  const uniqueCycles: CircularDependency[] = [];
  const seen = new Set<string>();

  for (const cycle of cycles) {
    const key = [...cycle.files].sort().join('->');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCycles.push(cycle);
    }
  }

  return uniqueCycles.slice(0, 10); // Limit to first 10
}

/**
 * Basic security check (pattern-based)
 */
async function analyzeSecurityBasic(
  packages: PackageAnalysis
): Promise<SecurityAnalysis> {
  const vulnerabilities: SecurityVulnerability[] = [];

  // Known vulnerable packages (simplified - real implementation would use a vulnerability database)
  const knownVulnerable: Record<string, { severity: SecurityVulnerability['severity']; title: string; fix: string }> = {
    'lodash': {
      severity: 'high',
      title: 'Prototype Pollution in lodash < 4.17.21',
      fix: 'Upgrade to lodash@4.17.21 or higher',
    },
    'minimist': {
      severity: 'moderate',
      title: 'Prototype Pollution in minimist < 1.2.6',
      fix: 'Upgrade to minimist@1.2.6 or higher',
    },
    'node-fetch': {
      severity: 'moderate',
      title: 'Exposure of Sensitive Information in node-fetch < 2.6.7',
      fix: 'Upgrade to node-fetch@2.6.7 or higher',
    },
  };

  const allPackages = [...packages.dependencies, ...packages.devDependencies];

  for (const pkg of allPackages) {
    const vuln = knownVulnerable[pkg.name];
    if (vuln) {
      // Check version (simplified - real implementation would do proper semver comparison)
      vulnerabilities.push({
        package: pkg.name,
        severity: vuln.severity,
        title: vuln.title,
        recommendation: vuln.fix,
      });
    }
  }

  return { vulnerabilities };
}

/**
 * Find potentially unused dependencies
 */
async function findUnusedDependencies(
  rootPath: string,
  packages: PackageAnalysis
): Promise<UnusedDependency[]> {
  const unused: UnusedDependency[] = [];

  // Get all source files
  const files = await glob('**/*.{ts,tsx,js,jsx,json}', {
    cwd: rootPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  // Read all file contents
  let allContent = '';
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      allContent += content + '\n';
    } catch {
      // Skip
    }
  }

  // Check each dependency
  const allPackages = [...packages.dependencies, ...packages.devDependencies];

  for (const pkg of allPackages) {
    const name = pkg.name;

    // Skip common false positives
    if (['typescript', '@types/', 'eslint', 'prettier', 'vitest', 'jest'].some((p) => name.includes(p))) {
      continue;
    }

    // Check if package is imported
    const importPatterns = [
      `from '${name}'`,
      `from "${name}"`,
      `require('${name}')`,
      `require("${name}")`,
      `from '${name}/`,
      `from "${name}/`,
    ];

    const isUsed = importPatterns.some((p) => allContent.includes(p));

    if (!isUsed) {
      unused.push({
        name,
        type: pkg.type,
        reason: 'No import found in source files',
      });
    }
  }

  return unused;
}
