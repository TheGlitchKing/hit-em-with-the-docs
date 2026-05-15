import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { migrateIncident } from '../../../src/core/knowledge-base/migrate.js';

describe('migrateIncident (2.3.0)', () => {
  let tmpDir: string;
  let flatFilePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-migrate-'));
    flatFilePath = join(tmpDir, '2026-05-14-vault-test.md');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('migrates a flat-file incident into the folder form', async () => {
    await writeFile(
      flatFilePath,
      `---
title: Vault Test Incident
domains: [incidents]
status: active
last_updated: '2026-05-14'
severity: high
resolution_status: resolved
components: [vault]
---

# Vault Test Incident

## Timeline
- 10:00 — issue began
- 10:15 — resolved

## Root Cause
Test.
`,
      'utf-8'
    );

    const result = await migrateIncident({ flatFilePath });

    expect(result.action).toBe('migrated');
    expect(result.targetFolder).toBe(join(tmpDir, '2026-05-14-vault-test'));

    // narrative.md exists with correct tier
    const narrative = await readFile(result.narrativePath, 'utf-8');
    expect(narrative).toContain('tier: incident-narrative');
    expect(narrative).toContain('id: 2026-05-14-vault-test');
    expect(narrative).toContain('## Timeline');

    // facts.md exists with skeleton
    const facts = await readFile(result.factsPath, 'utf-8');
    expect(facts).toContain('tier: incident-facts');
    expect(facts).toContain('incident_id: 2026-05-14-vault-test');
    expect(facts).toContain('produced: []');

    // evidence/ folder exists
    const evidenceStat = await stat(result.evidencePath);
    expect(evidenceStat.isDirectory()).toBe(true);

    // Original file renamed for rollback
    const renamed = `${flatFilePath}.migrated`;
    const renamedStat = await stat(renamed);
    expect(renamedStat.isFile()).toBe(true);
  });

  it('is idempotent — re-running on an already-migrated incident is a no-op', async () => {
    await writeFile(
      flatFilePath,
      `---
title: Test
domains: [incidents]
status: active
last_updated: '2026-05-14'
severity: high
resolution_status: resolved
components: [vault]
---

# Test
`,
      'utf-8'
    );

    // First run: migrates
    await migrateIncident({ flatFilePath });

    // Plant a "second" flat file at the same path (simulate the user re-running)
    await writeFile(flatFilePath, '---\ntitle: Stale\n---\n# Stale\n', 'utf-8');

    // Second run: detects folder exists, no-ops
    const result2 = await migrateIncident({ flatFilePath });
    expect(result2.action).toBe('already_migrated');
  });

  it('dry-run produces the plan without writing files', async () => {
    await writeFile(
      flatFilePath,
      `---
title: Dry Test
domains: [incidents]
status: active
last_updated: '2026-05-14'
severity: low
resolution_status: open
components: [vault]
---

# Dry Test
`,
      'utf-8'
    );

    const result = await migrateIncident({ flatFilePath, dryRun: true });

    expect(result.action).toBe('dry_run');
    expect(result.narrativeContent).toContain('tier: incident-narrative');
    expect(result.factsContent).toContain('tier: incident-facts');

    // Target folder NOT created
    let folderExists = true;
    try {
      await stat(result.targetFolder);
    } catch {
      folderExists = false;
    }
    expect(folderExists).toBe(false);

    // Original file still where it was
    const original = await stat(flatFilePath);
    expect(original.isFile()).toBe(true);
  });

  it('falls back to defaults when the source frontmatter is sparse', async () => {
    await writeFile(
      flatFilePath,
      `---
title: Bare
---

# Bare
`,
      'utf-8'
    );

    const result = await migrateIncident({ flatFilePath });
    const narrative = await readFile(result.narrativePath, 'utf-8');
    expect(narrative).toContain('severity: medium'); // default
    expect(narrative).toContain('resolution_status: resolved'); // default
    expect(narrative).toContain('- unknown'); // components default
  });
});
