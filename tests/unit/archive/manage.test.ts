import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { archiveDoc, unarchiveDoc } from '../../../src/core/archive/manage.js';
import { resetRegistry } from '../../../src/core/domains/registry.js';

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

const FM = (extra = '') =>
  `---\ntitle: Doc\ntier: reference\ndomains: [api]\nstatus: active\nlast_updated: '2026-01-01'\nversion: '1.0.0'\n${extra}---\n# Doc\n`;

describe('archiveDoc / unarchiveDoc', () => {
  let tmpDir: string;
  let docsPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-archive-mng-'));
    docsPath = join(tmpDir, '.documentation');
    await mkdir(join(docsPath, 'api'), { recursive: true });
    resetRegistry();
  });
  afterEach(async () => {
    resetRegistry();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeDoc(rel: string, body = FM()): Promise<void> {
    const abs = join(docsPath, rel);
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, body, 'utf-8');
  }

  it('moves a doc into archive/<domain>/ and stamps lifecycle metadata (fs fallback)', async () => {
    await writeDoc('api/old.md');
    const res = await archiveDoc({
      projectRoot: tmpDir,
      docsPath,
      file: 'api/old.md',
      reason: 'superseded',
      today: '2026-06-09',
    });
    expect(res.ok).toBe(true);
    expect(res.action).toBe('archived');
    expect(res.moveMethod).toBe('fs'); // tmpDir is not a git repo
    expect(await exists(join(docsPath, 'archive/api/old.md'))).toBe(true);
    expect(await exists(join(docsPath, 'api/old.md'))).toBe(false);

    const content = await readFile(join(docsPath, 'archive/api/old.md'), 'utf-8');
    expect(content).toMatch(/status: archived/);
    expect(content).toMatch(/archived_on: '?2026-06-09'?/);
    expect(content).toMatch(/archived_from: api\/old\.md/);
    expect(content).toMatch(/archived_reason: superseded/);
  });

  it('drops the doc from its domain INDEX after archiving', async () => {
    await writeDoc('api/old.md');
    await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/old.md', today: '2026-06-09' });
    const index = await readFile(join(docsPath, 'api/INDEX.md'), 'utf-8').catch(() => '');
    expect(index).not.toMatch(/old\.md/);
  });

  it('dry-run moves nothing', async () => {
    await writeDoc('api/old.md');
    const res = await archiveDoc({
      projectRoot: tmpDir,
      docsPath,
      file: 'api/old.md',
      dryRun: true,
      today: '2026-06-09',
    });
    expect(res.action).toBe('dry_run');
    expect(await exists(join(docsPath, 'api/old.md'))).toBe(true);
    expect(await exists(join(docsPath, 'archive/api/old.md'))).toBe(false);
  });

  it('blocks when active docs link to the target, unless --force', async () => {
    await writeDoc('api/old.md');
    await writeDoc('api/live.md', FM().replace('# Doc\n', '# Live\nSee [old](old.md).\n'));

    const blocked = await archiveDoc({
      projectRoot: tmpDir,
      docsPath,
      file: 'api/old.md',
      today: '2026-06-09',
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.action).toBe('blocked');
    expect(blocked.inboundLinks.length).toBeGreaterThan(0);
    expect(blocked.inboundLinks[0]!.source).toBe('api/live.md');
    expect(await exists(join(docsPath, 'api/old.md'))).toBe(true); // not moved

    const forced = await archiveDoc({
      projectRoot: tmpDir,
      docsPath,
      file: 'api/old.md',
      force: true,
      today: '2026-06-09',
    });
    expect(forced.ok).toBe(true);
    expect(await exists(join(docsPath, 'archive/api/old.md'))).toBe(true);
  });

  it('rejects missing files, non-markdown, and already-archived paths', async () => {
    const missing = await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/ghost.md' });
    expect(missing.ok).toBe(false);
    expect(missing.action).toBe('rejected');

    const notMd = await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/x.txt' });
    expect(notMd.ok).toBe(false);

    await writeDoc('archive/api/already.md');
    const already = await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'archive/api/already.md' });
    expect(already.ok).toBe(false);
  });

  it('uses git mv when in a git repo (history-preserving)', async () => {
    execFileSync('git', ['init', '-q'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 't@t.co'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: tmpDir });
    await writeDoc('api/old.md');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: tmpDir });

    const res = await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/old.md', today: '2026-06-09' });
    expect(res.ok).toBe(true);
    expect(res.moveMethod).toBe('git');
  });

  it('unarchive restores to archived_from and strips the stamp', async () => {
    await writeDoc('api/old.md');
    await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/old.md', today: '2026-06-09' });

    const res = await unarchiveDoc({ projectRoot: tmpDir, docsPath, file: 'archive/api/old.md' });
    expect(res.ok).toBe(true);
    expect(res.action).toBe('unarchived');
    expect(res.to).toBe('api/old.md');
    expect(await exists(join(docsPath, 'api/old.md'))).toBe(true);
    expect(await exists(join(docsPath, 'archive/api/old.md'))).toBe(false);

    const content = await readFile(join(docsPath, 'api/old.md'), 'utf-8');
    expect(content).toMatch(/status: active/);
    expect(content).not.toMatch(/archived_from/);
    expect(content).not.toMatch(/archived_on/);
  });

  it('unarchive rejects a non-archived path and refuses to clobber', async () => {
    const notArchived = await unarchiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/x.md' });
    expect(notArchived.ok).toBe(false);

    // archive, then recreate the original path → unarchive must refuse to clobber.
    await writeDoc('api/old.md');
    await archiveDoc({ projectRoot: tmpDir, docsPath, file: 'api/old.md', today: '2026-06-09' });
    await writeDoc('api/old.md'); // recreate at the restore target
    const clobber = await unarchiveDoc({ projectRoot: tmpDir, docsPath, file: 'archive/api/old.md' });
    expect(clobber.ok).toBe(false);
    expect(clobber.errors.join(' ')).toMatch(/already exists/i);
  });
});
