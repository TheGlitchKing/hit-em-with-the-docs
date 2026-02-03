import { readFile } from 'fs/promises';
import { relative, basename } from 'path';
import { glob } from '../../utils/glob.js';
import { logger } from '../../utils/logger.js';

export interface StandardsDiscoveryOptions {
  rootPath: string;
  silent?: boolean;
}

export interface DiscoveredStandards {
  naming: NamingStandards;
  fileOrganization: FileOrganizationStandards;
  codeStyle: CodeStyleStandards;
  documentation: DocumentationStandards;
  testing: TestingStandards;
}

export interface NamingStandards {
  functions: ConventionCompliance;
  classes: ConventionCompliance;
  constants: ConventionCompliance;
  variables: ConventionCompliance;
  files: ConventionCompliance;
}

export interface ConventionCompliance {
  convention: string;
  compliance: number;
  examples: { name: string; file: string; compliant: boolean }[];
}

export interface FileOrganizationStandards {
  patterns: { pattern: string; files: number; examples: string[] }[];
  rootFolders: string[];
}

export interface CodeStyleStandards {
  maxLineLength: number;
  indentation: 'spaces' | 'tabs' | 'mixed';
  indentSize?: number;
  semicolons: 'always' | 'never' | 'mixed';
  quotes: 'single' | 'double' | 'mixed';
  trailingCommas: 'always' | 'never' | 'mixed';
}

export interface DocumentationStandards {
  docstringStyle: string;
  coverage: number;
  typeHintCoverage: number;
}

export interface TestingStandards {
  pattern: string;
  coverage?: number;
  fixturePattern?: string;
}

/**
 * Discover implicit standards from codebase
 */
export async function discoverStandards(
  options: StandardsDiscoveryOptions
): Promise<DiscoveredStandards> {
  const { rootPath, silent = false } = options;

  if (!silent) {
    logger.header('Standards Discovery');
    logger.info(`Analyzing: ${rootPath}`);
  }

  // Find all source files
  const tsFiles = await glob('**/*.{ts,tsx}', {
    cwd: rootPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  const jsFiles = await glob('**/*.{js,jsx,mjs}', {
    cwd: rootPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  const allFiles = [...new Set([...tsFiles, ...jsFiles])];

  if (!silent) {
    logger.info(`Analyzing ${allFiles.length} source files...`);
  }

  // Discover each category
  const naming = await discoverNamingStandards(allFiles, rootPath);
  const fileOrganization = await discoverFileOrganization(rootPath);
  const codeStyle = await discoverCodeStyle(allFiles);
  const documentation = await discoverDocumentationStandards(allFiles);
  const testing = await discoverTestingStandards(rootPath);

  const standards: DiscoveredStandards = {
    naming,
    fileOrganization,
    codeStyle,
    documentation,
    testing,
  };

  if (!silent) {
    logger.newline();
    logger.success('Standards discovered:');
    logger.info(`  Functions: ${naming.functions.convention} (${naming.functions.compliance.toFixed(0)}% compliance)`);
    logger.info(`  Classes: ${naming.classes.convention} (${naming.classes.compliance.toFixed(0)}% compliance)`);
    logger.info(`  Indentation: ${codeStyle.indentation}${codeStyle.indentSize ? ` (${codeStyle.indentSize} spaces)` : ''}`);
    logger.info(`  Type hints: ${documentation.typeHintCoverage.toFixed(0)}% coverage`);
  }

  return standards;
}

/**
 * Discover naming conventions
 */
async function discoverNamingStandards(
  files: string[],
  rootPath: string
): Promise<NamingStandards> {
  const functionNames: { name: string; file: string }[] = [];
  const classNames: { name: string; file: string }[] = [];
  const constantNames: { name: string; file: string }[] = [];
  const variableNames: { name: string; file: string }[] = [];

  for (const file of files.slice(0, 100)) {
    try {
      const content = await readFile(file, 'utf-8');
      const relPath = relative(rootPath, file);

      // Extract function names
      const funcMatches = content.matchAll(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g);
      for (const match of funcMatches) {
        const name = match[1] ?? match[2];
        if (name) functionNames.push({ name, file: relPath });
      }

      // Extract class names
      const classMatches = content.matchAll(/class\s+(\w+)/g);
      for (const match of classMatches) {
        if (match[1]) classNames.push({ name: match[1], file: relPath });
      }

      // Extract constants (UPPER_SNAKE_CASE)
      const constMatches = content.matchAll(/const\s+([A-Z][A-Z0-9_]+)\s*=/g);
      for (const match of constMatches) {
        if (match[1]) constantNames.push({ name: match[1], file: relPath });
      }

      // Extract regular variables
      const varMatches = content.matchAll(/(?:const|let|var)\s+([a-z][a-zA-Z0-9]*)\s*=/g);
      for (const match of varMatches) {
        if (match[1]) variableNames.push({ name: match[1], file: relPath });
      }
    } catch {
      // Skip
    }
  }

  // Analyze file naming
  const fileNameExamples = files.slice(0, 20).map((f) => ({
    name: basename(f),
    file: relative(rootPath, f),
  }));

  return {
    functions: analyzeNamingConvention(functionNames, 'camelCase'),
    classes: analyzeNamingConvention(classNames, 'PascalCase'),
    constants: analyzeNamingConvention(constantNames, 'UPPER_SNAKE_CASE'),
    variables: analyzeNamingConvention(variableNames, 'camelCase'),
    files: analyzeFileNaming(fileNameExamples),
  };
}

/**
 * Analyze naming convention compliance
 */
function analyzeNamingConvention(
  names: { name: string; file: string }[],
  expectedConvention: string
): ConventionCompliance {
  const checks = {
    camelCase: (n: string) => /^[a-z][a-zA-Z0-9]*$/.test(n),
    PascalCase: (n: string) => /^[A-Z][a-zA-Z0-9]*$/.test(n),
    UPPER_SNAKE_CASE: (n: string) => /^[A-Z][A-Z0-9_]*$/.test(n),
    'kebab-case': (n: string) => /^[a-z][a-z0-9-]*$/.test(n),
    snake_case: (n: string) => /^[a-z][a-z0-9_]*$/.test(n),
  };

  const check = checks[expectedConvention as keyof typeof checks] ?? checks.camelCase;

  const compliant = names.filter((n) => check(n.name));
  const compliance = names.length > 0 ? (compliant.length / names.length) * 100 : 100;

  // Detect actual convention used
  let detectedConvention = expectedConvention;
  let maxCompliance = compliance;

  for (const [convention, checkFn] of Object.entries(checks)) {
    const conventionCompliance = names.filter((n) => checkFn(n.name)).length / Math.max(names.length, 1) * 100;
    if (conventionCompliance > maxCompliance) {
      maxCompliance = conventionCompliance;
      detectedConvention = convention;
    }
  }

  return {
    convention: detectedConvention,
    compliance: maxCompliance,
    examples: names.slice(0, 5).map((n) => ({
      ...n,
      compliant: check(n.name),
    })),
  };
}

/**
 * Analyze file naming convention
 */
function analyzeFileNaming(
  files: { name: string; file: string }[]
): ConventionCompliance {
  const kebabCase = files.filter((f) => /^[a-z][a-z0-9-]*\./.test(f.name)).length;
  const camelCase = files.filter((f) => /^[a-z][a-zA-Z0-9]*\./.test(f.name)).length;
  const pascalCase = files.filter((f) => /^[A-Z][a-zA-Z0-9]*\./.test(f.name)).length;
  const snakeCase = files.filter((f) => /^[a-z][a-z0-9_]*\./.test(f.name)).length;

  const total = files.length || 1;
  const conventions = [
    { name: 'kebab-case', count: kebabCase },
    { name: 'camelCase', count: camelCase },
    { name: 'PascalCase', count: pascalCase },
    { name: 'snake_case', count: snakeCase },
  ];

  const best = conventions.sort((a, b) => b.count - a.count)[0]!;

  return {
    convention: best.name,
    compliance: (best.count / total) * 100,
    examples: files.slice(0, 5).map((f) => ({
      ...f,
      compliant: best.name === 'kebab-case' ? /^[a-z][a-z0-9-]*\./.test(f.name) : true,
    })),
  };
}

/**
 * Discover file organization patterns
 */
async function discoverFileOrganization(
  rootPath: string
): Promise<FileOrganizationStandards> {
  const patterns: { pattern: string; files: number; examples: string[] }[] = [];

  // Common folder patterns to check
  const folderPatterns = [
    { pattern: 'src/', glob: 'src/**/*' },
    { pattern: 'lib/', glob: 'lib/**/*' },
    { pattern: 'components/', glob: '**/components/**/*' },
    { pattern: 'services/', glob: '**/services/**/*' },
    { pattern: 'models/', glob: '**/models/**/*' },
    { pattern: 'utils/', glob: '**/utils/**/*' },
    { pattern: 'hooks/', glob: '**/hooks/**/*' },
    { pattern: 'api/', glob: '**/api/**/*' },
    { pattern: 'routes/', glob: '**/routes/**/*' },
    { pattern: 'routers/', glob: '**/routers/**/*' },
    { pattern: 'tests/', glob: '**/tests/**/*' },
    { pattern: '__tests__/', glob: '**/__tests__/**/*' },
  ];

  for (const { pattern: name, glob: globPattern } of folderPatterns) {
    const files = await glob(globPattern, {
      cwd: rootPath,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    if (files.length > 0) {
      patterns.push({
        pattern: name,
        files: files.length,
        examples: files.slice(0, 3),
      });
    }
  }

  // Get root folders
  const rootEntries = await glob('*', { cwd: rootPath });
  const rootFolders = rootEntries.filter((e) => !e.includes('.'));

  return {
    patterns: patterns.sort((a, b) => b.files - a.files),
    rootFolders,
  };
}

/**
 * Discover code style preferences
 */
async function discoverCodeStyle(files: string[]): Promise<CodeStyleStandards> {
  let tabCount = 0;
  let spaceCount = 0;
  let space2Count = 0;
  let space4Count = 0;
  let semiCount = 0;
  let noSemiCount = 0;
  let singleQuoteCount = 0;
  let doubleQuoteCount = 0;
  let trailingCommaCount = 0;
  let noTrailingCommaCount = 0;
  let maxLineLength = 0;

  for (const file of files.slice(0, 50)) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        // Check indentation
        if (line.startsWith('\t')) tabCount++;
        if (line.startsWith('  ')) {
          spaceCount++;
          if (line.startsWith('    ') && !line.startsWith('      ')) space4Count++;
          else if (line.startsWith('  ') && !line.startsWith('    ')) space2Count++;
        }

        // Check max line length
        if (line.length > maxLineLength) maxLineLength = line.length;

        // Check semicolons (at end of statements)
        if (/[a-zA-Z0-9)}\]'"`]\s*;$/.test(line.trim())) semiCount++;
        if (/[a-zA-Z0-9)}\]'"`]$/.test(line.trim()) && !line.trim().endsWith('{')) noSemiCount++;

        // Check quotes
        if (line.includes("'") && !line.includes('"')) singleQuoteCount++;
        if (line.includes('"') && !line.includes("'")) doubleQuoteCount++;

        // Check trailing commas
        if (/,\s*[}\]]/.test(line)) trailingCommaCount++;
        if (/[^,\s]\s*[}\]]/.test(line)) noTrailingCommaCount++;
      }
    } catch {
      // Skip
    }
  }

  // Determine preferences
  const indentation: 'spaces' | 'tabs' | 'mixed' =
    tabCount > spaceCount * 0.8 ? 'tabs' :
    spaceCount > tabCount * 0.8 ? 'spaces' : 'mixed';

  const indentSize = space4Count > space2Count ? 4 : 2;

  const semicolons: 'always' | 'never' | 'mixed' =
    semiCount > noSemiCount * 2 ? 'always' :
    noSemiCount > semiCount * 2 ? 'never' : 'mixed';

  const quotes: 'single' | 'double' | 'mixed' =
    singleQuoteCount > doubleQuoteCount * 2 ? 'single' :
    doubleQuoteCount > singleQuoteCount * 2 ? 'double' : 'mixed';

  const trailingCommas: 'always' | 'never' | 'mixed' =
    trailingCommaCount > noTrailingCommaCount * 2 ? 'always' :
    noTrailingCommaCount > trailingCommaCount * 2 ? 'never' : 'mixed';

  const result: CodeStyleStandards = {
    maxLineLength,
    indentation,
    semicolons,
    quotes,
    trailingCommas,
  };
  if (indentation === 'spaces') {
    result.indentSize = indentSize;
  }
  return result;
}

/**
 * Discover documentation standards
 */
async function discoverDocumentationStandards(
  files: string[]
): Promise<DocumentationStandards> {
  let totalFunctions = 0;
  let documentedFunctions = 0;
  let typedFunctions = 0;
  let jsdocCount = 0;
  let tsdocCount = 0;

  for (const file of files.slice(0, 50)) {
    try {
      const content = await readFile(file, 'utf-8');

      // Count functions
      const functions = content.match(/(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g);
      totalFunctions += functions?.length ?? 0;

      // Count documented functions (JSDoc/TSDoc comments before functions)
      const jsdocs = content.match(/\/\*\*[\s\S]*?\*\/\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var)/g);
      documentedFunctions += jsdocs?.length ?? 0;

      // Check docstring style
      if (content.includes('@param')) jsdocCount++;
      if (content.includes('@returns')) tsdocCount++;

      // Count typed functions (TypeScript)
      const typed = content.match(/\([^)]*:[^)]+\)\s*(?::\s*\w+)?\s*(?:=>|{)/g);
      typedFunctions += typed?.length ?? 0;
    } catch {
      // Skip
    }
  }

  const docstringStyle = tsdocCount > jsdocCount ? 'TSDoc' : 'JSDoc';
  const coverage = totalFunctions > 0 ? (documentedFunctions / totalFunctions) * 100 : 0;
  const typeHintCoverage = totalFunctions > 0 ? (typedFunctions / totalFunctions) * 100 : 0;

  return {
    docstringStyle,
    coverage,
    typeHintCoverage,
  };
}

/**
 * Discover testing standards
 */
async function discoverTestingStandards(
  rootPath: string
): Promise<TestingStandards> {
  // Check for test files in various patterns
  const patterns = [
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/__tests__/*.ts',
    '**/test/*.ts',
    '**/tests/*.ts',
  ];

  let testPattern = '*.test.ts';
  let maxFiles = 0;

  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: rootPath,
      ignore: ['**/node_modules/**'],
    });

    if (files.length > maxFiles) {
      maxFiles = files.length;
      testPattern = pattern.replace('**/', '').replace('/*.ts', '');
    }
  }

  // Check for fixtures
  const fixtures = await glob('**/fixtures/**/*', {
    cwd: rootPath,
    ignore: ['**/node_modules/**'],
  });

  const result: TestingStandards = {
    pattern: testPattern,
  };
  if (fixtures.length > 0) {
    result.fixturePattern = 'fixtures/';
  }
  return result;
}
