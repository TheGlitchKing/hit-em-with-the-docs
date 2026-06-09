import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { addDomain, removeDomain, listDomains } from '../../../src/core/domains/manage.js';
import { resetRegistry } from '../../../src/core/domains/registry.js';

const SPEC = {
  id: 'compliance',
  name: 'Compliance',
  description: 'Regulatory compliance docs',
  keywords: ['gdpr', 'hipaa'],
  loadPriority: 5,
  category: 'features',
};

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
async function readConfig(dir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(
      await readFile(join(dir, '.claude', 'hit-em-with-the-docs.json'), 'utf-8')
    );
  } catch {
    return {};
  }
}

describe('manage: addDomain / removeDomain / listDomains', () => {
  let tmpDir: string;
  let docsPath: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-manage-'));
    docsPath = join(tmpDir, '.documentation');
    await mkdir(docsPath, { recursive: true });
    // addDomain's scaffold uses the cwd-based registry — mirror the CLI, which
    // always runs with cwd === projectRoot.
    process.chdir(tmpDir);
    resetRegistry();
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    resetRegistry();
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ---- add ----

  it('adds a valid domain: writes config + scaffolds folder', async () => {
    const res = await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    expect(res.ok).toBe(true);
    expect(res.action).toBe('added');
    expect(await exists(join(docsPath, 'compliance'))).toBe(true);
    expect(await exists(join(docsPath, 'compliance', 'INDEX.md'))).toBe(true);
    expect(await exists(join(docsPath, 'compliance', 'REGISTRY.md'))).toBe(true);
    const cfg = await readConfig(tmpDir);
    expect((cfg.domains as { id: string }[])[0]!.id).toBe('compliance');
  });

  it('dry-run writes nothing', async () => {
    const res = await addDomain({
      projectRoot: tmpDir,
      docsPath,
      spec: SPEC,
      dryRun: true,
    });
    expect(res.action).toBe('dry_run');
    expect(res.spec!.id).toBe('compliance');
    expect(await exists(join(docsPath, 'compliance'))).toBe(false);
    expect(await exists(join(tmpDir, '.claude', 'hit-em-with-the-docs.json'))).toBe(false);
  });

  it('rejects a built-in id', async () => {
    const res = await addDomain({
      projectRoot: tmpDir,
      docsPath,
      spec: { ...SPEC, id: 'security' },
    });
    expect(res.ok).toBe(false);
    expect(res.action).toBe('rejected');
    expect(res.errors.join(' ')).toMatch(/built-in/i);
  });

  it('rejects a duplicate custom id', async () => {
    await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    const res = await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/already exists/i);
  });

  it('rejects an invalid spec (empty keywords, bad category)', async () => {
    const r1 = await addDomain({
      projectRoot: tmpDir,
      docsPath,
      spec: { ...SPEC, keywords: [] },
    });
    expect(r1.ok).toBe(false);
    const r2 = await addDomain({
      projectRoot: tmpDir,
      docsPath,
      spec: { ...SPEC, category: 'bogus' },
    });
    expect(r2.ok).toBe(false);
  });

  it('preserves other config keys when adding', async () => {
    await mkdir(join(tmpDir, '.claude'), { recursive: true });
    await writeFile(
      join(tmpDir, '.claude', 'hit-em-with-the-docs.json'),
      JSON.stringify({ updatePolicy: 'nudge', vault: { audit_window_days: 45 } }),
      'utf-8'
    );
    await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    const cfg = await readConfig(tmpDir);
    expect(cfg.updatePolicy).toBe('nudge');
    expect((cfg.vault as { audit_window_days: number }).audit_window_days).toBe(45);
    expect((cfg.domains as unknown[]).length).toBe(1);
  });

  // ---- list ----

  it('listDomains partitions built-in vs custom', async () => {
    await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    resetRegistry();
    const { builtin, custom } = listDomains(tmpDir);
    expect(builtin).toHaveLength(15);
    expect(custom).toHaveLength(1);
    expect(custom[0]!.id).toBe('compliance');
  });

  // ---- remove ----

  it('removes a custom domain non-destructively, reporting orphan count', async () => {
    await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    // Drop a doc into the domain so removal orphans it.
    await writeFile(join(docsPath, 'compliance', 'policy.md'), '# Policy\n', 'utf-8');

    const res = await removeDomain({ projectRoot: tmpDir, docsPath, id: 'compliance' });
    expect(res.ok).toBe(true);
    expect(res.action).toBe('removed');
    expect(res.orphanedDocs).toBe(1);
    // Folder + doc survive (non-destructive).
    expect(await exists(join(docsPath, 'compliance'))).toBe(true);
    expect(await exists(join(docsPath, 'compliance', 'policy.md'))).toBe(true);
    // Config no longer lists it.
    const cfg = await readConfig(tmpDir);
    expect((cfg.domains as unknown[]).length).toBe(0);
  });

  it('remove dry-run reports orphans but does not change config', async () => {
    await addDomain({ projectRoot: tmpDir, docsPath, spec: SPEC });
    await writeFile(join(docsPath, 'compliance', 'a.md'), '# A\n', 'utf-8');
    const res = await removeDomain({
      projectRoot: tmpDir,
      docsPath,
      id: 'compliance',
      dryRun: true,
    });
    expect(res.action).toBe('dry_run');
    expect(res.orphanedDocs).toBe(1);
    const cfg = await readConfig(tmpDir);
    expect((cfg.domains as unknown[]).length).toBe(1);
  });

  it('refuses to remove a built-in domain', async () => {
    const res = await removeDomain({ projectRoot: tmpDir, docsPath, id: 'security' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/built-in/i);
  });

  it('rejects removing a domain that is not configured', async () => {
    const res = await removeDomain({ projectRoot: tmpDir, docsPath, id: 'ghost' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/not a configured custom domain/i);
  });
});
