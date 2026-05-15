/**
 * Plugin config loader for `.claude/hit-em-with-the-docs.json`.
 *
 * The runtime (`@theglitchking/claude-plugin-runtime`) owns the
 * `updatePolicy` field. This module reads the same file and adds the
 * 2.3.0 `vault` block for knowledge-base configuration. Missing or
 * malformed files fall back to defaults — never throws.
 */

import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';

export const DEFAULT_VAULT_ROOT = '.documentation/knowledge-base/';
export const DEFAULT_PLAYBOOK_GLOBS = ['.documentation/**/*.md'];
export const DEFAULT_AUDIT_WINDOW_DAYS = 90;

/**
 * Schema for `.claude/hit-em-with-the-docs.json`. Every field is optional
 * with a sensible default. The runtime's `updatePolicy` is preserved via
 * `.passthrough()`.
 */
const vaultConfigSchema = z
  .object({
    root: z.string().default(DEFAULT_VAULT_ROOT),
    playbook_paths: z.array(z.string()).default(DEFAULT_PLAYBOOK_GLOBS),
    audit_window_days: z.number().int().positive().default(DEFAULT_AUDIT_WINDOW_DAYS),
  })
  .default({});

const pluginConfigSchema = z
  .object({
    vault: vaultConfigSchema,
  })
  .passthrough();

export type VaultConfig = z.infer<typeof vaultConfigSchema>;
export type PluginConfig = z.infer<typeof pluginConfigSchema>;

const CONFIG_FILENAME = '.claude/hit-em-with-the-docs.json';

/**
 * Load the plugin config for a project, applying defaults. Never throws —
 * missing file, malformed JSON, and invalid shapes all fall through to
 * defaults. Pass `projectRoot` (defaults to `process.cwd()`) to control
 * which directory to read from.
 */
export async function loadPluginConfig(projectRoot?: string): Promise<PluginConfig> {
  const root = projectRoot ?? process.cwd();
  const configPath = resolve(root, CONFIG_FILENAME);

  let raw: unknown;
  try {
    const contents = await readFile(configPath, 'utf-8');
    raw = JSON.parse(contents);
  } catch {
    raw = {};
  }

  const parsed = pluginConfigSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  // Malformed config — return defaults rather than crash.
  return pluginConfigSchema.parse({});
}

/**
 * Synchronous variant — used in test setup where async loading is awkward.
 * Same fail-open behavior.
 */
export function loadPluginConfigSync(projectRoot?: string): PluginConfig {
  const root = projectRoot ?? process.cwd();
  const configPath = resolve(root, CONFIG_FILENAME);

  let raw: unknown;
  try {
    // Lazy require to avoid hoisting an fs dep when this code path isn't used.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    const contents = readFileSync(configPath, 'utf-8');
    raw = JSON.parse(contents);
  } catch {
    raw = {};
  }

  const parsed = pluginConfigSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return pluginConfigSchema.parse({});
}

/**
 * Resolve the vault root for a project, applying config + defaults.
 * The returned path is absolute.
 */
export function resolveVaultRoot(projectRoot: string, config: PluginConfig): string {
  return resolve(projectRoot, config.vault.root);
}

/**
 * Resolve playbook scan globs relative to project root, as absolute glob
 * patterns. Returned globs are suitable for `glob` library consumption.
 */
export function resolvePlaybookGlobs(
  projectRoot: string,
  config: PluginConfig
): string[] {
  return config.vault.playbook_paths.map((p) => join(projectRoot, p));
}
