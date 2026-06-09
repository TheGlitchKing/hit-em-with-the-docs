import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildRegistry,
  getRegistry,
  resetRegistry,
  getAllDomains,
  getDomainDefinition,
  isValidDomain,
  getDomainsByCategory,
  getDomainsByPriority,
  getAllKeywords,
} from '../../../src/core/domains/registry.js';
import { DOMAINS } from '../../../src/core/domains/constants.js';

const CUSTOM = {
  id: 'compliance',
  name: 'Compliance',
  description: 'Regulatory compliance docs',
  keywords: ['gdpr', 'hipaa', 'compliance'],
  loadPriority: 7,
  category: 'features',
};

async function writeConfig(dir: string, obj: unknown): Promise<void> {
  await mkdir(join(dir, '.claude'), { recursive: true });
  await writeFile(
    join(dir, '.claude', 'hit-em-with-the-docs.json'),
    JSON.stringify(obj),
    'utf-8'
  );
}

describe('domain registry — buildRegistry (explicit projectRoot)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-registry-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns exactly the 15 built-ins with no config', () => {
    const reg = buildRegistry(tmpDir);
    expect(reg.ids).toHaveLength(15);
    expect(reg.ids).toEqual([...DOMAINS]);
  });

  it('merges a custom domain after the built-ins', async () => {
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    const reg = buildRegistry(tmpDir);
    expect(reg.ids).toHaveLength(16);
    expect(reg.ids.slice(0, 15)).toEqual([...DOMAINS]); // built-ins first, in order
    expect(reg.ids[15]).toBe('compliance');
    expect(reg.definitions.get('compliance')!.keywords).toContain('gdpr');
  });

  it('drops a custom entry that collides with a built-in id', async () => {
    await writeConfig(tmpDir, {
      domains: [{ ...CUSTOM, id: 'security' }],
    });
    const reg = buildRegistry(tmpDir);
    // 'security' stays the built-in; the colliding custom entry is ignored.
    expect(reg.ids.filter((d) => d === 'security')).toHaveLength(1);
    expect(reg.ids).toHaveLength(15);
    expect(reg.definitions.get('security')!.name).toBe('Security');
  });
});

describe('domain registry — cached accessors (cwd-based)', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-registry-cwd-'));
    process.chdir(tmpDir);
    resetRegistry();
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    resetRegistry();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('isValidDomain accepts built-in and custom, rejects unknown', async () => {
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    resetRegistry();
    expect(isValidDomain('security')).toBe(true);
    expect(isValidDomain('compliance')).toBe(true);
    expect(isValidDomain('nope')).toBe(false);
  });

  it('getAllDomains includes the custom domain', async () => {
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    resetRegistry();
    expect(getAllDomains()).toContain('compliance');
  });

  it('getDomainDefinition returns the custom def and throws on unknown', async () => {
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    resetRegistry();
    expect(getDomainDefinition('compliance').loadPriority).toBe(7);
    expect(() => getDomainDefinition('ghost')).toThrow(/Unknown domain/);
  });

  it('getAllKeywords maps custom keywords to the custom domain', async () => {
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    resetRegistry();
    expect(getAllKeywords().get('gdpr')).toContain('compliance');
  });

  it('getDomainsByCategory includes the custom domain in its category', async () => {
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    resetRegistry();
    expect(getDomainsByCategory('features')).toContain('compliance');
  });

  it('getDomainsByPriority places a high-priority custom domain near the top', async () => {
    await writeConfig(tmpDir, { domains: [{ ...CUSTOM, loadPriority: 10 }] });
    resetRegistry();
    expect(getDomainsByPriority().indexOf('compliance')).toBeLessThan(6);
  });

  it('resetRegistry re-reads config (cache invalidation)', async () => {
    expect(getRegistry().ids).toHaveLength(15);
    await writeConfig(tmpDir, { domains: [CUSTOM] });
    // Without reset, still cached at 15.
    expect(getRegistry().ids).toHaveLength(15);
    resetRegistry();
    expect(getRegistry().ids).toHaveLength(16);
  });
});
