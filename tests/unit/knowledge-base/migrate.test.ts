import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { migrateIncident } from '../../../src/core/knowledge-base/migrate.js';

describe('migrateIncident (2.3.0 / 2.4.0 target-path fix)', () => {
  let tmpDir: string;
  let vaultRoot: string;
  let flatFilePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-migrate-'));
    vaultRoot = tmpDir;
    flatFilePath = join(tmpDir, '2026-05-14-vault-test.md');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('migrates a flat-file incident into <vault>/incidents/<slug>/ (canonical target — fixed in 2.4.0)', async () => {
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

    const result = await migrateIncident({ flatFilePath, vaultRoot });

    expect(result.action).toBe('migrated');
    // KEY FIX: target is under incidents/, not a sibling of the flat file.
    expect(result.targetFolder).toBe(
      join(vaultRoot, 'incidents', '2026-05-14-vault-test')
    );

    const narrative = await readFile(result.narrativePath, 'utf-8');
    expect(narrative).toContain('tier: incident-narrative');
    expect(narrative).toContain('id: 2026-05-14-vault-test');
    expect(narrative).toContain('## Timeline');

    const facts = await readFile(result.factsPath, 'utf-8');
    expect(facts).toContain('tier: incident-facts');
    expect(facts).toContain('incident_id: 2026-05-14-vault-test');
    expect(facts).toContain('produced: []');

    const evidenceStat = await stat(result.evidencePath);
    expect(evidenceStat.isDirectory()).toBe(true);

    const renamed = `${flatFilePath}.migrated`;
    const renamedStat = await stat(renamed);
    expect(renamedStat.isFile()).toBe(true);
  });

  it('creates <vault>/incidents/ parent dir if it doesn\'t exist yet', async () => {
    await writeFile(
      flatFilePath,
      `---
title: T
domains: [incidents]
status: active
last_updated: '2026-05-14'
severity: high
resolution_status: resolved
components: [vault]
---

# T
`,
      'utf-8'
    );
    // No incidents/ subdir yet — migration must create it.
    const result = await migrateIncident({ flatFilePath, vaultRoot });
    expect(result.action).toBe('migrated');
    const incidentsParent = join(vaultRoot, 'incidents');
    const s = await stat(incidentsParent);
    expect(s.isDirectory()).toBe(true);
  });

  it('is idempotent at the canonical location — second run reports already_migrated (new)', async () => {
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

    await migrateIncident({ flatFilePath, vaultRoot });

    // Plant a fresh flat file (simulate user re-running)
    await writeFile(flatFilePath, '---\ntitle: Stale\n---\n# Stale\n', 'utf-8');

    const result2 = await migrateIncident({ flatFilePath, vaultRoot });
    expect(result2.action).toBe('already_migrated');
    expect(result2.existingLocation).toBe('new');
  });

  it('detects pre-existing 2.3.0-style folders at the legacy location and reports already_migrated (legacy)', async () => {
    // Simulate the 2.3.0 bug aftermath: a folder at the legacy location
    // (<vault>/<slug>/) with a valid narrative.md.
    const legacyFolder = join(vaultRoot, '2026-05-14-vault-test');
    await mkdir(legacyFolder, { recursive: true });
    await writeFile(
      join(legacyFolder, 'narrative.md'),
      `---
title: Legacy
tier: incident-narrative
domains: [incidents]
status: active
last_updated: '2026-05-14'
id: 2026-05-14-vault-test
date: '2026-05-14'
severity: medium
resolution_status: resolved
components: [vault]
---

# Legacy
`,
      'utf-8'
    );

    // Now create a fresh flat file with the same slug and try to migrate.
    await writeFile(
      flatFilePath,
      `---
title: New
domains: [incidents]
status: active
last_updated: '2026-05-14'
severity: high
resolution_status: resolved
components: [vault]
---

# New
`,
      'utf-8'
    );

    const result = await migrateIncident({ flatFilePath, vaultRoot });
    expect(result.action).toBe('already_migrated');
    expect(result.existingLocation).toBe('legacy');
    // The result's narrativePath points at the legacy folder so the CLI
    // can tell the user where the existing migration lives.
    expect(result.narrativePath).toBe(join(legacyFolder, 'narrative.md'));
  });

  it('--force re-migrates even when canonical folder exists', async () => {
    await writeFile(
      flatFilePath,
      `---
title: Original
domains: [incidents]
status: active
last_updated: '2026-05-14'
severity: high
resolution_status: resolved
components: [vault]
---

# Original
`,
      'utf-8'
    );

    // First migration
    await migrateIncident({ flatFilePath, vaultRoot });

    // Re-create flat file with new content
    await writeFile(
      flatFilePath,
      `---
title: Replaced
domains: [incidents]
status: active
last_updated: '2026-05-15'
severity: critical
resolution_status: resolved
components: [vault, alloy]
---

# Replaced
`,
      'utf-8'
    );

    const result = await migrateIncident({
      flatFilePath,
      vaultRoot,
      force: true,
    });
    expect(result.action).toBe('migrated');

    const narrative = await readFile(result.narrativePath, 'utf-8');
    expect(narrative).toContain('title: Replaced');
    expect(narrative).toContain('severity: critical');
  });

  it('dry-run produces the canonical plan without writing files', async () => {
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

    const result = await migrateIncident({
      flatFilePath,
      vaultRoot,
      dryRun: true,
    });

    expect(result.action).toBe('dry_run');
    expect(result.targetFolder).toBe(
      join(vaultRoot, 'incidents', '2026-05-14-vault-test')
    );
    expect(result.narrativeContent).toContain('tier: incident-narrative');
    expect(result.factsContent).toContain('tier: incident-facts');

    let folderExists = true;
    try {
      await stat(result.targetFolder);
    } catch {
      folderExists = false;
    }
    expect(folderExists).toBe(false);

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

    const result = await migrateIncident({ flatFilePath, vaultRoot });
    const narrative = await readFile(result.narrativePath, 'utf-8');
    expect(narrative).toContain('severity: medium');
    expect(narrative).toContain('resolution_status: resolved');
    expect(narrative).toContain('- unknown');
  });
});
