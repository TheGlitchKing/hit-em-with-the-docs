import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  customDomainSchema,
  loadPluginConfig,
  loadPluginConfigSync,
  readRawConfig,
  writeRawConfig,
  configFilePath,
} from '../../../src/utils/config.js';

const VALID = {
  id: 'compliance',
  name: 'Compliance',
  description: 'Regulatory compliance docs',
  keywords: ['gdpr', 'hipaa'],
  loadPriority: 5,
  category: 'features',
};

describe('customDomainSchema', () => {
  it('accepts a well-formed entry', () => {
    expect(customDomainSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a non-kebab id', () => {
    expect(customDomainSchema.safeParse({ ...VALID, id: 'Bad Id' }).success).toBe(false);
    expect(customDomainSchema.safeParse({ ...VALID, id: 'UPPER' }).success).toBe(false);
  });

  it('rejects empty keywords', () => {
    expect(customDomainSchema.safeParse({ ...VALID, keywords: [] }).success).toBe(false);
  });

  it('rejects an out-of-enum category', () => {
    expect(customDomainSchema.safeParse({ ...VALID, category: 'nonsense' }).success).toBe(false);
  });

  it('rejects loadPriority outside 1-10', () => {
    expect(customDomainSchema.safeParse({ ...VALID, loadPriority: 0 }).success).toBe(false);
    expect(customDomainSchema.safeParse({ ...VALID, loadPriority: 11 }).success).toBe(false);
  });
});

describe('config loaders with custom domains', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-config-'));
    await mkdir(join(tmpDir, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeConfig(obj: unknown): Promise<void> {
    await writeFile(
      join(tmpDir, '.claude', 'hit-em-with-the-docs.json'),
      JSON.stringify(obj),
      'utf-8'
    );
  }

  it('loads a valid custom domain (async)', async () => {
    await writeConfig({ domains: [VALID] });
    const config = await loadPluginConfig(tmpDir);
    expect(config.domains).toHaveLength(1);
    expect(config.domains[0]!.id).toBe('compliance');
  });

  it('loads a valid custom domain (sync) — regression: ESM require(fs) bug', async () => {
    // loadPluginConfigSync historically used a lazy require("fs") that throws
    // in the ESM runtime, silently returning defaults. This guards the static-
    // import fix so the sync path (used by the domain registry) actually reads
    // the file.
    await writeConfig({ domains: [VALID] });
    const config = loadPluginConfigSync(tmpDir);
    expect(config.domains).toHaveLength(1);
    expect(config.domains[0]!.id).toBe('compliance');
  });

  it('drops a malformed domain entry but keeps valid ones (never-throw)', async () => {
    await writeConfig({
      domains: [VALID, { id: 'Bad Id', keywords: [] }],
      vault: { audit_window_days: 30 },
    });
    const config = loadPluginConfigSync(tmpDir);
    expect(config.domains).toHaveLength(1);
    expect(config.domains[0]!.id).toBe('compliance');
    // A bad domain entry must not nuke the rest of the config.
    expect(config.vault.audit_window_days).toBe(30);
  });

  it('defaults domains to [] when absent', () => {
    const config = loadPluginConfigSync(tmpDir);
    expect(config.domains).toEqual([]);
  });
});

describe('readRawConfig / writeRawConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-raw-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns {} when no config exists', async () => {
    expect(await readRawConfig(tmpDir)).toEqual({});
  });

  it('round-trips and preserves unmodeled keys (updatePolicy)', async () => {
    await writeRawConfig(tmpDir, {
      updatePolicy: 'nudge',
      vault: { audit_window_days: 45 },
      domains: [VALID],
    });
    const raw = await readRawConfig(tmpDir);
    expect(raw.updatePolicy).toBe('nudge');
    expect((raw.vault as { audit_window_days: number }).audit_window_days).toBe(45);
    expect((raw.domains as unknown[]).length).toBe(1);
  });

  it('creates the .claude directory if missing', async () => {
    const path = await writeRawConfig(tmpDir, { domains: [] });
    expect(path).toBe(configFilePath(tmpDir));
    const contents = await readFile(path, 'utf-8');
    expect(contents.endsWith('\n')).toBe(true);
  });
});
