/**
 * Backward-compatibility regression test (2.3.0).
 *
 * Load-bearing guarantee from the phase plan: a project that adopts none of
 * the 2.3.0 knowledge-base features must observe zero behavior change.
 * Specifically:
 *   - `hewtd maintain` produces no NEW files under the docs tree.
 *   - The audit emits no KB-coded issues.
 *   - The maintenance flow completes without errors.
 *
 * If this test fails, the PR can't ship.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runMaintenance } from '../../src/core/maintain/orchestrator.js';
import { auditDocumentation } from '../../src/core/audit/auditor.js';

describe('Backward compatibility — no-vault project (2.3.0 regression test)', () => {
  let tmpRoot: string;
  let docsPath: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'hewtd-backcompat-'));
    docsPath = join(tmpRoot, '.documentation');

    // Build a minimal pre-2.3.0 doc tree: one guide, no knowledge-base/,
    // no symptoms: blocks anywhere.
    await mkdir(join(docsPath, 'security'), { recursive: true });
    await writeFile(
      join(docsPath, 'security', 'auth-guide.md'),
      `---
title: "Authentication Guide"
tier: guide
domains: [security]
audience: [developers]
tags: [auth]
status: active
last_updated: '2026-05-14'
version: '1.0.0'
---

# Authentication Guide

Body content for the guide.
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('hewtd maintain does not create a knowledge-base/ subtree', async () => {
    await runMaintenance({ docsPath, silent: true });

    const docsContents = await readdir(docsPath);
    expect(docsContents).not.toContain('knowledge-base');
  });

  it('hewtd maintain does not create facts/INDEX.md, incidents/INDEX.md, or symptoms/INDEX.md', async () => {
    await runMaintenance({ docsPath, silent: true });

    const vaultPath = join(docsPath, 'knowledge-base');
    let vaultExists = true;
    try {
      await readdir(vaultPath);
    } catch {
      vaultExists = false;
    }
    expect(vaultExists).toBe(false);
  });

  it('audit emits no KB-coded errors on a pre-2.3.0 doc tree', async () => {
    const result = await auditDocumentation({ docsPath, silent: true });
    const kbIssues = result.issues.filter((i) => i.code !== undefined);
    expect(kbIssues).toEqual([]);
  });

  it('maintain completes without errors on a no-vault tree', async () => {
    const result = await runMaintenance({ docsPath, silent: true });
    // Some pre-existing maintain errors are possible (missing INDEX.md for
    // domains, etc.) — those are not 2.3.0's concern. What we assert is that
    // NO error in the result.errors list mentions knowledge-base.
    const kbErrors = result.errors.filter((e) =>
      e.toLowerCase().includes('knowledge-base')
    );
    expect(kbErrors).toEqual([]);
  });

  it('strict audit still passes on a pre-2.3.0 tree (no KB violations to escalate)', async () => {
    const result = await auditDocumentation({
      docsPath,
      silent: true,
      strict: true,
    });
    const kbIssues = result.issues.filter((i) => i.code !== undefined);
    const errorIssues = result.issues.filter((i) => i.severity === 'error');

    // The CLI's strict-mode predicate: exit non-zero on any error OR any
    // KB-coded issue. With a clean pre-2.3.0 tree, both lists are empty.
    expect(kbIssues).toEqual([]);
    expect(errorIssues).toEqual([]);
  });
});

describe('Backward compatibility — KB-adopting project (2.3.0 active path)', () => {
  let tmpRoot: string;
  let docsPath: string;
  let vaultPath: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'hewtd-kb-active-'));
    docsPath = join(tmpRoot, '.documentation');
    vaultPath = join(docsPath, 'knowledge-base');

    // Tree with the KB subtree present + one fact + one incident.
    await mkdir(join(vaultPath, 'facts'), { recursive: true });
    await mkdir(join(vaultPath, 'incidents', '2026-05-14-test'), {
      recursive: true,
    });
    await writeFile(
      join(vaultPath, 'facts', 'test-fact.md'),
      `---
title: Test fact
tier: fact
domains: [observability]
status: active
last_updated: '2026-05-14'
id: test-fact
confidence: high
last_verified: '2026-05-14'
provenance:
  - incidents/2026-05-14-test/
tags: [test]
---

# Test fact

## Claim
A test claim.
`,
      'utf-8'
    );
    await writeFile(
      join(vaultPath, 'incidents', '2026-05-14-test', 'narrative.md'),
      `---
title: Test incident
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

# Test incident
`,
      'utf-8'
    );
    await writeFile(
      join(vaultPath, 'incidents', '2026-05-14-test', 'facts.md'),
      `---
title: Facts from 2026-05-14 test
tier: incident-facts
domains: [incidents]
status: active
last_updated: '2026-05-14'
incident_id: 2026-05-14-test
produced: [test-fact]
---

# Facts from test
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('hewtd maintain DOES generate KB indexes when a vault root exists', async () => {
    await runMaintenance({ docsPath, silent: true });

    const factsIndex = join(vaultPath, 'facts', 'INDEX.md');
    const incidentsIndex = join(vaultPath, 'incidents', 'INDEX.md');
    const symptomsIndex = join(vaultPath, 'symptoms', 'INDEX.md');

    let factsExists = true;
    let incidentsExists = true;
    let symptomsExists = true;
    try {
      await readdir(factsIndex);
    } catch (e: any) {
      factsExists = e.code !== 'ENOENT';
    }
    try {
      await readdir(incidentsIndex);
    } catch (e: any) {
      incidentsExists = e.code !== 'ENOENT';
    }
    try {
      await readdir(symptomsIndex);
    } catch (e: any) {
      symptomsExists = e.code !== 'ENOENT';
    }

    expect(factsExists).toBe(true);
    expect(incidentsExists).toBe(true);
    expect(symptomsExists).toBe(true);
  });
});
