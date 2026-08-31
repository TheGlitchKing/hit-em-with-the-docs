/**
 * `metadata-sync --fix` writes frontmatter into every markdown file it finds,
 * and `--path` accepts any directory. Aimed at a source tree it rewrote
 * unrelated markdown across a whole repo (#25) — infrastructure notes, test
 * fixtures, loose READMEs — stamping 16 lines of hewtd metadata onto files that
 * are not documentation.
 *
 * These tests pin the scope: writes require a documentation root, reads do not.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { syncMetadata } from '../../../src/core/metadata/sync.js';
import { resetRegistry } from '../../../src/core/domains/registry.js';

const DOC = [
  '---',
  'title: A',
  'tier: guide',
  'domains: [api]',
  'status: active',
  'last_updated: 2026-01-01',
  'version: 1.0.0',
  '---',
  '# A',
  'body',
  '',
].join('\n');

const NON_DOC = '# Firewall setup\n\nrules here\n';

describe('metadata-sync scope (#25)', () => {
  let root: string;

  beforeEach(async () => {
    resetRegistry();
    root = await mkdtemp(join(tmpdir(), 'hewtd-sync-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    resetRegistry();
  });

  /** A source tree with markdown that is NOT documentation. */
  async function sourceTree(): Promise<string> {
    await mkdir(join(root, 'infrastructure', 'vault'), { recursive: true });
    await mkdir(join(root, 'frontend', 'tests'), { recursive: true });
    await writeFile(join(root, 'infrastructure', 'vault', 'SETUP.md'), NON_DOC, 'utf-8');
    await writeFile(join(root, 'frontend', 'tests', 'notes.md'), NON_DOC, 'utf-8');
    await writeFile(join(root, 'LOOSE.md'), NON_DOC, 'utf-8');
    return root;
  }

  /** A scaffolded documentation root. */
  async function docsTree(): Promise<string> {
    const docs = join(root, '.documentation');
    await mkdir(join(docs, 'api'), { recursive: true });
    await writeFile(join(docs, 'INDEX.md'), '# Index\n', 'utf-8');
    await writeFile(join(docs, 'api', 'a.md'), DOC, 'utf-8');
    return docs;
  }

  it('refuses to --fix a directory that is not a documentation root', async () => {
    const src = await sourceTree();
    const result = await syncMetadata({ docsPath: src, fix: true, silent: true });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.error).toContain('not a hit-em-with-the-docs documentation root');
    expect(result.fixedFiles).toBe(0);
  });

  it('leaves every non-documentation file byte-identical', async () => {
    const src = await sourceTree();
    const before = await Promise.all(
      ['infrastructure/vault/SETUP.md', 'frontend/tests/notes.md', 'LOOSE.md'].map((p) =>
        readFile(join(src, p), 'utf-8')
      )
    );

    await syncMetadata({ docsPath: src, fix: true, silent: true });

    const after = await Promise.all(
      ['infrastructure/vault/SETUP.md', 'frontend/tests/notes.md', 'LOOSE.md'].map((p) =>
        readFile(join(src, p), 'utf-8')
      )
    );
    expect(after).toEqual(before);
    for (const content of after) {
      expect(content).not.toContain('estimated_read_time');
    }
  });

  it('still scans a non-documentation directory read-only', async () => {
    // Reads write nothing, and inspecting an unmanaged directory is useful.
    const src = await sourceTree();
    const result = await syncMetadata({ docsPath: src, fix: false, silent: true });

    expect(result.totalFiles).toBe(3);
    expect(result.errors.every((e) => !e.error.includes('documentation root'))).toBe(true);
  });

  it('allows --dry-run anywhere, so the preview of --fix still works', async () => {
    const src = await sourceTree();
    const before = await readFile(join(src, 'LOOSE.md'), 'utf-8');

    const result = await syncMetadata({ docsPath: src, fix: true, dryRun: true, silent: true });

    expect(result.errors).toHaveLength(0);
    expect(await readFile(join(src, 'LOOSE.md'), 'utf-8')).toBe(before);
  });

  it('fixes normally inside a scaffolded documentation root', async () => {
    const docs = await docsTree();
    const result = await syncMetadata({ docsPath: docs, fix: true, silent: true });

    expect(result.errors).toHaveLength(0);
    expect(result.fixedFiles).toBeGreaterThan(0);
  });

  it('accepts a docs tree whose indexes have not been generated yet', async () => {
    // `maintain` syncs at Step 1 and regenerates indexes at Step 1.5, so
    // demanding INDEX.md alone would fire on a legitimate first run. A folder
    // named for an active domain is the second marker.
    const docs = join(root, '.documentation');
    await mkdir(join(docs, 'api'), { recursive: true });
    await writeFile(join(docs, 'api', 'a.md'), DOC, 'utf-8');

    const result = await syncMetadata({ docsPath: docs, fix: true, silent: true });
    expect(result.errors).toHaveLength(0);
  });

  it('refuses an empty directory with neither marker', async () => {
    const empty = join(root, 'empty');
    await mkdir(empty, { recursive: true });

    const result = await syncMetadata({ docsPath: empty, fix: true, silent: true });
    expect(result.errors[0]!.error).toContain('not a hit-em-with-the-docs documentation root');
  });
});
