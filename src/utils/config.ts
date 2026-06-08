/**
 * Plugin config loader for `.claude/hit-em-with-the-docs.json`.
 *
 * The runtime (`@theglitchking/claude-plugin-runtime`) owns the
 * `updatePolicy` field. This module reads the same file and adds the
 * 2.3.0 `vault` block for knowledge-base configuration. Missing or
 * malformed files fall back to defaults — never throws.
 */

import { readFileSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { z } from 'zod';

export const DEFAULT_VAULT_ROOT = '.documentation/knowledge-base/';
export const DEFAULT_PLAYBOOK_GLOBS = ['.documentation/**/*.md'];
export const DEFAULT_AUDIT_WINDOW_DAYS = 90;

/** Kebab-case slug: matches the fact/incident id convention used elsewhere. */
const KEBAB_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Valid `category` values for a domain. Kept in sync with `DomainDefinition`
 * in `core/domains/constants.ts` — duplicated here intentionally so the config
 * loader carries no dependency on the domain layer (the registry imports the
 * config, not the other way around).
 */
export const DOMAIN_CATEGORY_VALUES = [
  'core',
  'development',
  'features',
  'advanced',
] as const;

/**
 * Schema for a single custom domain entry. Mirrors `DomainDefinition`. Used
 * by the registry merge layer and by `hewtd domain add` (which validates
 * strictly before writing). Collision with a built-in id is NOT checked here —
 * that requires knowing the built-in set, so it is enforced in the registry
 * merge (drop-with-warning) and in the CLI writer (hard error).
 */
export const customDomainSchema = z.object({
  id: z.string().regex(KEBAB_SLUG_RE, 'domain id must be kebab-case'),
  name: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1, 'at least one keyword is required'),
  loadPriority: z.number().int().min(1).max(10),
  category: z.enum(DOMAIN_CATEGORY_VALUES),
});

export type CustomDomainConfig = z.infer<typeof customDomainSchema>;

/**
 * Lenient `domains[]` parser: drops malformed entries instead of failing the
 * whole config load. This preserves `loadPluginConfig`'s never-throw contract —
 * a hand-edited config with one bad domain entry still loads the rest (and the
 * valid vault block). The CLI `domain add` command does the strict, user-facing
 * validation; this is the last-line filter for the runtime.
 */
const lenientDomainsArray = z
  .preprocess((val) => {
    if (!Array.isArray(val)) return [];
    return val.filter((entry) => customDomainSchema.safeParse(entry).success);
  }, z.array(customDomainSchema))
  .default([]);

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
    domains: lenientDomainsArray,
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
 * Read the RAW config object (unparsed, no defaults applied) for a project.
 * Returns `{}` when the file is missing or unreadable/malformed. Use this when
 * you need to MUTATE the config and write it back without clobbering keys this
 * module doesn't model (e.g. the runtime's `updatePolicy`). Never throws.
 */
export async function readRawConfig(
  projectRoot?: string
): Promise<Record<string, unknown>> {
  const root = projectRoot ?? process.cwd();
  const configPath = resolve(root, CONFIG_FILENAME);
  try {
    const contents = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(contents);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Write the RAW config object back to `.claude/hit-em-with-the-docs.json`,
 * creating the `.claude/` directory if needed. Pretty-printed with a trailing
 * newline. Returns the absolute path written.
 */
export async function writeRawConfig(
  projectRoot: string,
  data: Record<string, unknown>
): Promise<string> {
  const configPath = resolve(projectRoot, CONFIG_FILENAME);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return configPath;
}

/** Absolute path to a project's config file (whether or not it exists). */
export function configFilePath(projectRoot: string): string {
  return resolve(projectRoot, CONFIG_FILENAME);
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
