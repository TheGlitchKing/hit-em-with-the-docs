import { glob as globLib } from 'glob';
import { resolve, relative, dirname, basename, extname, join } from 'path';
import { stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';

export interface GlobOptions {
  cwd?: string;
  absolute?: boolean;
  ignore?: string[];
  dot?: boolean;
}

/**
 * Find files matching a glob pattern
 */
export async function glob(
  pattern: string,
  options: GlobOptions = {}
): Promise<string[]> {
  const {
    cwd = process.cwd(),
    absolute = false,
    ignore = ['node_modules/**', 'dist/**', '.git/**'],
    dot = false,
  } = options;

  const matches = await globLib(pattern, {
    cwd,
    absolute,
    ignore,
    dot,
    nodir: true,
  });

  return matches;
}

/**
 * Find all markdown files in a directory
 */
export async function findMarkdownFiles(
  dir: string,
  options: Omit<GlobOptions, 'absolute'> = {}
): Promise<string[]> {
  return glob('**/*.md', {
    ...options,
    cwd: dir,
    absolute: true,
  });
}

/**
 * Check if a path exists
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path exists (sync)
 */
export function pathExistsSync(path: string): boolean {
  return existsSync(path);
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Get all subdirectories in a directory
 */
export async function getSubdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Resolve a path relative to a base
 */
export function resolvePath(base: string, relativePath: string): string {
  return resolve(base, relativePath);
}

/**
 * Get relative path from base to target
 */
export function getRelativePath(base: string, target: string): string {
  return relative(base, target);
}

/**
 * Get directory name from path
 */
export function getDirname(path: string): string {
  return dirname(path);
}

/**
 * Get base name from path
 */
export function getBasename(path: string): string {
  return basename(path);
}

/**
 * Get file extension
 */
export function getExtension(path: string): string {
  return extname(path);
}

/**
 * Remove file extension from path
 */
export function removeExtension(path: string): string {
  const ext = extname(path);
  return path.slice(0, -ext.length);
}

/**
 * Normalize path separators
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
