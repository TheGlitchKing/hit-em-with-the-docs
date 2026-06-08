/**
 * Runtime domain registry.
 *
 * The set of valid domains used to be a compile-time constant. As of the
 * custom-domains feature it is resolved at runtime: the 15 built-ins
 * (`DOMAINS` / `DOMAIN_DEFINITIONS`) merged with any custom domains declared
 * in `.claude/hit-em-with-the-docs.json` (`domains: [...]`).
 *
 * This module is the single source of truth for the ACTIVE set. The helper
 * functions here (getAllDomains, getDomainDefinition, isValidDomain, …)
 * replace the const-based versions that previously lived in `constants.ts`;
 * every consumer should import them from here.
 *
 * The registry is a cached singleton. The CLI is a short-lived per-invocation
 * process, so reading config once and caching is correct and keeps the
 * consumer surface synchronous. Tests must call `resetRegistry()` between
 * cases that change config.
 */

import { logger } from '../../utils/logger.js';
import { loadPluginConfigSync } from '../../utils/config.js';
import {
  DOMAINS,
  DOMAIN_DEFINITIONS,
  type Domain,
  type DomainDefinition,
} from './constants.js';

export interface DomainRegistry {
  /** Ordered ids: built-ins first (declared order), then custom (config order). */
  ids: Domain[];
  definitions: Map<Domain, DomainDefinition>;
}

let cached: DomainRegistry | null = null;

/**
 * Build a fresh registry from disk config (no caching). Exposed mainly for
 * tests and for callers that need a registry for a specific project root.
 */
export function buildRegistry(projectRoot?: string): DomainRegistry {
  const config = loadPluginConfigSync(projectRoot);

  const definitions = new Map<Domain, DomainDefinition>();
  const ids: Domain[] = [];

  // Built-ins first, preserving declared order.
  for (const id of DOMAINS) {
    definitions.set(id, DOMAIN_DEFINITIONS[id]);
    ids.push(id);
  }

  // Custom domains from config, in config order. Collisions with a built-in
  // are dropped with a warning (the CLI writer rejects them up front, so this
  // only fires on a hand-edited config).
  for (const custom of config.domains ?? []) {
    if (definitions.has(custom.id)) {
      logger.warn(
        `Custom domain "${custom.id}" collides with a built-in domain; ignoring the config entry.`
      );
      continue;
    }
    definitions.set(custom.id, {
      id: custom.id,
      name: custom.name,
      description: custom.description,
      keywords: custom.keywords,
      loadPriority: custom.loadPriority,
      category: custom.category,
    });
    ids.push(custom.id);
  }

  return { ids, definitions };
}

/**
 * The cached active registry. Built lazily on first access from the config at
 * `process.cwd()` (or `projectRoot` if passed on the first call).
 */
export function getRegistry(projectRoot?: string): DomainRegistry {
  if (!cached) {
    cached = buildRegistry(projectRoot);
  }
  return cached;
}

/** Clear the cached registry. Call this in test setup after mutating config. */
export function resetRegistry(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Registry-aware accessors (drop-in replacements for the old constants.ts fns)
// ---------------------------------------------------------------------------

/** All active domain ids (built-in + custom), in registry order. */
export function getAllDomains(): Domain[] {
  return [...getRegistry().ids];
}

/**
 * Definition for an active domain. Throws on an unknown id — callers iterate
 * `getAllDomains()` or guard with `isValidDomain()` first, so a miss is a bug.
 */
export function getDomainDefinition(domain: Domain): DomainDefinition {
  const def = getRegistry().definitions.get(domain);
  if (!def) {
    throw new Error(`Unknown domain: ${domain}`);
  }
  return def;
}

/** True if `value` is a valid domain in the active set (built-in OR custom). */
export function isValidDomain(value: string): value is Domain {
  return getRegistry().definitions.has(value);
}

/** Active domains in a given category. */
export function getDomainsByCategory(category: DomainCategoryArg): Domain[] {
  const reg = getRegistry();
  return reg.ids.filter((d) => reg.definitions.get(d)!.category === category);
}
type DomainCategoryArg = DomainDefinition['category'];

/** Active domains sorted by load priority (highest first). */
export function getDomainsByPriority(): Domain[] {
  const reg = getRegistry();
  return [...reg.ids].sort(
    (a, b) =>
      reg.definitions.get(b)!.loadPriority - reg.definitions.get(a)!.loadPriority
  );
}

/** Map of keyword → domains that declare it, across the active set. */
export function getAllKeywords(): Map<string, Domain[]> {
  const reg = getRegistry();
  const keywordMap = new Map<string, Domain[]>();

  for (const id of reg.ids) {
    const def = reg.definitions.get(id)!;
    for (const keyword of def.keywords) {
      const existing = keywordMap.get(keyword) ?? [];
      existing.push(id);
      keywordMap.set(keyword, existing);
    }
  }

  return keywordMap;
}
