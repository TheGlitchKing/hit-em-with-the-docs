/**
 * Custom-domain management: the deterministic WRITER behind
 * `hewtd domain add|remove|list`.
 *
 * All mutation logic lives here (not in the slash command) so it is unit-
 * testable and reused across the CLI, the GitHub Action, and the library
 * export — none of which have an LLM present. The slash command is a thin
 * interaction wrapper that calls this via the CLI.
 */

import {
  customDomainSchema,
  readRawConfig,
  writeRawConfig,
  configFilePath,
  DOMAIN_CATEGORY_VALUES,
  type CustomDomainConfig,
} from '../../utils/config.js';
import { isBuiltinDomain, type DomainDefinition } from './constants.js';
import { buildRegistry, resetRegistry } from './registry.js';
import { createScaffold } from '../../generators/scaffold.js';
import { regenerateIndexes, listDomainDocFiles } from '../../generators/regenerate.js';

export interface DomainListResult {
  builtin: DomainDefinition[];
  custom: DomainDefinition[];
}

/**
 * List the active domain set, partitioned into built-in vs custom. Reads the
 * registry for the given project root (uncached, so it reflects on-disk config
 * even mid-process).
 */
export function listDomains(projectRoot: string): DomainListResult {
  const registry = buildRegistry(projectRoot);
  const builtin: DomainDefinition[] = [];
  const custom: DomainDefinition[] = [];
  for (const id of registry.ids) {
    const def = registry.definitions.get(id)!;
    if (isBuiltinDomain(id)) builtin.push(def);
    else custom.push(def);
  }
  return { builtin, custom };
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

export interface AddDomainInput {
  projectRoot: string;
  /** Documentation root (e.g. absolute path to `.documentation`). */
  docsPath: string;
  spec: {
    id: string;
    name: string;
    description: string;
    keywords: string[];
    loadPriority: number;
    category: string;
  };
  dryRun?: boolean;
}

export interface AddDomainResult {
  ok: boolean;
  /** Validation / collision errors (empty when ok). */
  errors: string[];
  action: 'added' | 'dry_run' | 'rejected';
  spec?: CustomDomainConfig;
  configPath: string;
  domainFolder?: string;
  filesWritten?: string[];
}

/**
 * Validate and add a custom domain: writes the entry into config and scaffolds
 * its `.documentation/<id>/` folder (+ INDEX/REGISTRY), then refreshes the root
 * indexes so the new domain is listed. Idempotency: refuses an id that is a
 * built-in or already a configured custom domain.
 */
export async function addDomain(input: AddDomainInput): Promise<AddDomainResult> {
  const { projectRoot, docsPath, spec, dryRun = false } = input;
  const configPath = configFilePath(projectRoot);
  const errors: string[] = [];

  // Strict, user-facing validation (the config loader's lenient filter is the
  // last line of defence; this is the first).
  const parsed = customDomainSchema.safeParse(spec);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return { ok: false, errors, action: 'rejected', configPath };
  }
  const valid = parsed.data;

  if (isBuiltinDomain(valid.id)) {
    errors.push(`"${valid.id}" is a built-in domain; pick a different id.`);
    return { ok: false, errors, action: 'rejected', configPath };
  }

  const raw = await readRawConfig(projectRoot);
  const existing = Array.isArray(raw.domains)
    ? (raw.domains as unknown[])
    : [];
  const alreadyConfigured = existing.some(
    (d) => d && typeof d === 'object' && (d as { id?: unknown }).id === valid.id
  );
  if (alreadyConfigured) {
    errors.push(`Custom domain "${valid.id}" already exists in config.`);
    return { ok: false, errors, action: 'rejected', configPath };
  }

  const domainFolder = `${docsPath}/${valid.id}`;

  if (dryRun) {
    return {
      ok: true,
      errors,
      action: 'dry_run',
      spec: valid,
      configPath,
      domainFolder,
    };
  }

  // Persist the config entry, preserving every other key (vault, updatePolicy…).
  raw.domains = [...existing, valid];
  await writeRawConfig(projectRoot, raw);

  // Invalidate the cached registry so scaffolding sees the new domain.
  resetRegistry();

  // createScaffold creates the (missing) domain folder + initial INDEX/REGISTRY.
  // regenerateIndexes then refreshes the ROOT index so it lists the new domain.
  const scaffold = await createScaffold({
    rootPath: docsPath,
    domains: [valid.id],
    silent: true,
  });
  const regen = await regenerateIndexes({ docsPath, silent: true });

  return {
    ok: true,
    errors,
    action: 'added',
    spec: valid,
    configPath,
    domainFolder,
    filesWritten: [...scaffold.created, ...regen.filesWritten],
  };
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export interface RemoveDomainInput {
  projectRoot: string;
  docsPath: string;
  id: string;
  dryRun?: boolean;
}

export interface RemoveDomainResult {
  ok: boolean;
  errors: string[];
  action: 'removed' | 'dry_run' | 'rejected';
  configPath: string;
  /** Number of documents left behind in the folder (NOT deleted). */
  orphanedDocs: number;
  domainFolder: string;
}

/**
 * Remove a custom domain from config. NON-DESTRUCTIVE: the
 * `.documentation/<id>/` folder and any docs in it are left on disk — the
 * caller is told how many docs are now orphaned. Refuses to remove a built-in.
 */
export async function removeDomain(
  input: RemoveDomainInput
): Promise<RemoveDomainResult> {
  const { projectRoot, docsPath, id, dryRun = false } = input;
  const configPath = configFilePath(projectRoot);
  const domainFolder = `${docsPath}/${id}`;
  const errors: string[] = [];

  if (isBuiltinDomain(id)) {
    errors.push(
      `"${id}" is a built-in domain and cannot be removed (built-ins are part of the compiled contract).`
    );
    return {
      ok: false,
      errors,
      action: 'rejected',
      configPath,
      orphanedDocs: 0,
      domainFolder,
    };
  }

  const raw = await readRawConfig(projectRoot);
  const existing = Array.isArray(raw.domains) ? (raw.domains as unknown[]) : [];
  const present = existing.some(
    (d) => d && typeof d === 'object' && (d as { id?: unknown }).id === id
  );
  if (!present) {
    errors.push(`"${id}" is not a configured custom domain. Nothing to remove.`);
    return {
      ok: false,
      errors,
      action: 'rejected',
      configPath,
      orphanedDocs: 0,
      domainFolder,
    };
  }

  // Count docs that will be orphaned (folder is never deleted).
  const orphanedDocs = (await listDomainDocFiles(docsPath, id)).length;

  if (dryRun) {
    return {
      ok: true,
      errors,
      action: 'dry_run',
      configPath,
      orphanedDocs,
      domainFolder,
    };
  }

  raw.domains = existing.filter(
    (d) => !(d && typeof d === 'object' && (d as { id?: unknown }).id === id)
  );
  await writeRawConfig(projectRoot, raw);
  resetRegistry();

  return {
    ok: true,
    errors,
    action: 'removed',
    configPath,
    orphanedDocs,
    domainFolder,
  };
}

/** Re-exported for the CLI's `--category` help text. */
export { DOMAIN_CATEGORY_VALUES };
