import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fixLegacyLayout } from '../../../src/core/knowledge-base/fix-legacy-layout.js';

describe('fixLegacyLayout (2.4.0)', () => {
  let tmpProject: string;
  let vaultRoot: string;

  beforeEach(async () => {
    tmpProject = await mkdtemp(join(tmpdir(), 'hewtd-fix-legacy-'));
    vaultRoot = join(tmpProject, '.documentation/knowledge-base');
    await mkdir(vaultRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpProject, { recursive: true, force: true });
  });

  it('moves legacy-layout folders into <vault>/incidents/ and reports them', async () => {
    // Plant two 2.3.0-buggy folders at the vault root.
    for (const slug of ['2026-04-23-foo', '2026-04-24-bar']) {
      const folder = join(vaultRoot, slug);
      await mkdir(folder, { recursive: true });
      await writeFile(
        join(folder, 'narrative.md'),
        `---
title: ${slug}
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: ${slug}
date: '${slug.slice(0, 10)}'
severity: medium
resolution_status: resolved
components: [test]
---

# ${slug}
`,
        'utf-8'
      );
    }

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.action).toBe('fixed');
    expect(result.moved).toHaveLength(2);
    expect(result.moved.map((m) => m.slug).sort()).toEqual([
      '2026-04-23-foo',
      '2026-04-24-bar',
    ]);

    // Folders now exist at the canonical location
    expect(existsSync(join(vaultRoot, 'incidents', '2026-04-23-foo'))).toBe(true);
    expect(existsSync(join(vaultRoot, 'incidents', '2026-04-24-bar'))).toBe(true);
    // And NOT at the legacy location
    expect(existsSync(join(vaultRoot, '2026-04-23-foo'))).toBe(false);
    expect(existsSync(join(vaultRoot, '2026-04-24-bar'))).toBe(false);
  });

  it('is a no-op on a clean vault (no legacy folders to move)', async () => {
    // Vault has only the canonical incidents/ folder, no stragglers.
    const canonical = join(vaultRoot, 'incidents', '2026-05-14-test');
    await mkdir(canonical, { recursive: true });
    await writeFile(
      join(canonical, 'narrative.md'),
      `---
title: Test
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-05-14'
id: 2026-05-14-test
date: '2026-05-14'
severity: low
resolution_status: resolved
components: [test]
---

# Test
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.action).toBe('no_op');
    expect(result.moved).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('leaves the reserved facts/ and symptoms/ folders alone', async () => {
    // Plant a legacy incident folder + the reserved facts/ folder.
    await mkdir(join(vaultRoot, 'facts'), { recursive: true });
    await writeFile(
      join(vaultRoot, 'facts', 'some-fact.md'),
      `---
title: A fact
tier: fact
domains: [test]
status: active
last_updated: '2026-05-14'
id: some-fact
confidence: high
last_verified: '2026-05-14'
provenance:
  - 2026-04-23-foo/
---

# A fact
`,
      'utf-8'
    );

    const legacyFolder = join(vaultRoot, '2026-04-23-foo');
    await mkdir(legacyFolder, { recursive: true });
    await writeFile(
      join(legacyFolder, 'narrative.md'),
      `---
title: Foo
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: 2026-04-23-foo
date: '2026-04-23'
severity: low
resolution_status: resolved
components: [test]
---

# Foo
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.action).toBe('fixed');
    expect(result.moved).toHaveLength(1);

    // facts/ folder untouched
    expect(existsSync(join(vaultRoot, 'facts', 'some-fact.md'))).toBe(true);
  });

  it('rewrites fact provenance references to point at the new location', async () => {
    // Plant: a legacy folder + a fact whose provenance points at the legacy path.
    const legacyFolder = join(vaultRoot, '2026-04-23-foo');
    await mkdir(legacyFolder, { recursive: true });
    await writeFile(
      join(legacyFolder, 'narrative.md'),
      `---
title: Foo
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: 2026-04-23-foo
date: '2026-04-23'
severity: low
resolution_status: resolved
components: [test]
---

# Foo
`,
      'utf-8'
    );

    await mkdir(join(vaultRoot, 'facts'), { recursive: true });
    const factPath = join(vaultRoot, 'facts', 'foo-fact.md');
    await writeFile(
      factPath,
      `---
title: Foo fact
tier: fact
domains: [test]
status: active
last_updated: '2026-04-23'
id: foo-fact
confidence: high
last_verified: '2026-04-23'
provenance:
  - .documentation/knowledge-base/2026-04-23-foo/
---

# Foo fact
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.action).toBe('fixed');
    expect(result.rewrittenProvenance).toHaveLength(1);
    expect(result.rewrittenProvenance[0]!.oldRef).toBe(
      '.documentation/knowledge-base/2026-04-23-foo/'
    );
    expect(result.rewrittenProvenance[0]!.newRef).toBe(
      '.documentation/knowledge-base/incidents/2026-04-23-foo/'
    );

    // The fact file on disk has the rewritten reference.
    const updated = await readFile(factPath, 'utf-8');
    expect(updated).toContain('.documentation/knowledge-base/incidents/2026-04-23-foo/');
    expect(updated).not.toContain('.documentation/knowledge-base/2026-04-23-foo/');
  });

  it('also rewrites bare-slug provenance refs (e.g. "2026-04-23-foo/" without the vault prefix)', async () => {
    const legacyFolder = join(vaultRoot, '2026-04-23-foo');
    await mkdir(legacyFolder, { recursive: true });
    await writeFile(
      join(legacyFolder, 'narrative.md'),
      `---
title: Foo
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: 2026-04-23-foo
date: '2026-04-23'
severity: low
resolution_status: resolved
components: [test]
---
`,
      'utf-8'
    );

    await mkdir(join(vaultRoot, 'facts'), { recursive: true });
    const factPath = join(vaultRoot, 'facts', 'foo-fact.md');
    await writeFile(
      factPath,
      `---
title: Foo fact
tier: fact
domains: [test]
status: active
last_updated: '2026-04-23'
id: foo-fact
confidence: high
last_verified: '2026-04-23'
provenance:
  - 2026-04-23-foo/
---
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.rewrittenProvenance).toHaveLength(1);
    expect(result.rewrittenProvenance[0]!.oldRef).toBe('2026-04-23-foo/');
    expect(result.rewrittenProvenance[0]!.newRef).toBe(
      '.documentation/knowledge-base/incidents/2026-04-23-foo/'
    );
  });

  it('dry-run does not move folders or rewrite files', async () => {
    const legacyFolder = join(vaultRoot, '2026-04-23-foo');
    await mkdir(legacyFolder, { recursive: true });
    await writeFile(
      join(legacyFolder, 'narrative.md'),
      `---
title: Foo
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: 2026-04-23-foo
date: '2026-04-23'
severity: low
resolution_status: resolved
components: [test]
---
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
      dryRun: true,
    });

    expect(result.action).toBe('dry_run');
    expect(result.moved).toHaveLength(1);
    // BUT the actual folder is unchanged.
    expect(existsSync(legacyFolder)).toBe(true);
    expect(existsSync(join(vaultRoot, 'incidents', '2026-04-23-foo'))).toBe(false);
  });

  it('skips folders whose narrative.md is not tier: incident-narrative', async () => {
    // A folder with a narrative.md that's a different tier (e.g. a guide).
    const decoyFolder = join(vaultRoot, 'some-guide-folder');
    await mkdir(decoyFolder, { recursive: true });
    await writeFile(
      join(decoyFolder, 'narrative.md'),
      `---
title: Not an incident
tier: guide
domains: [misc]
status: active
last_updated: '2026-05-14'
version: '1.0.0'
---

# Just a guide that happens to be in a narrative.md
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.moved).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.path).toBe(decoyFolder);
    expect(result.skipped[0]!.reason).toContain('tier is not "incident-narrative"');
  });

  it('refuses to clobber an existing canonical folder at the destination', async () => {
    // Plant: a legacy folder AND an existing canonical folder with the same slug.
    const legacyFolder = join(vaultRoot, '2026-04-23-foo');
    const canonicalFolder = join(vaultRoot, 'incidents', '2026-04-23-foo');
    await mkdir(legacyFolder, { recursive: true });
    await mkdir(canonicalFolder, { recursive: true });
    await writeFile(
      join(legacyFolder, 'narrative.md'),
      `---
title: Legacy
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: 2026-04-23-foo
date: '2026-04-23'
severity: low
resolution_status: resolved
components: [test]
---
`,
      'utf-8'
    );
    await writeFile(
      join(canonicalFolder, 'narrative.md'),
      `---
title: Canonical
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-04-23'
id: 2026-04-23-foo
date: '2026-04-23'
severity: low
resolution_status: resolved
components: [test]
---
`,
      'utf-8'
    );

    const result = await fixLegacyLayout({
      vaultRoot,
      projectRoot: tmpProject,
    });

    expect(result.moved).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain('destination already exists');

    // Both folders still exist (no clobber).
    expect(existsSync(legacyFolder)).toBe(true);
    expect(existsSync(canonicalFolder)).toBe(true);
  });
});
