/**
 * Full pipeline integration test (2.3.0 PR3).
 *
 * Walks through the user-facing workflow end-to-end against a temp tree:
 *   1. migrate-incident   (legacy flat-file → folder form)
 *   2. extract-facts      (writer side; LLM proposer simulated by accept array)
 *   3. cite               (insert citation into a playbook)
 *   4. audit-facts        (stale detection — clean tree)
 *   5. find-citers        (citation graph lookup)
 *
 * The test exercises the deterministic CLI surface; the LLM proposer
 * (extract-facts slash command) is not covered here — that's the
 * non-deterministic prompt-driven layer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { migrateIncident } from '../../src/core/knowledge-base/migrate.js';
import { extractFacts } from '../../src/core/knowledge-base/extract.js';
import { cite } from '../../src/core/knowledge-base/cite.js';
import { auditFacts } from '../../src/core/knowledge-base/audit.js';
import {
  buildCiterIndex,
  findCitersInIndex,
} from '../../src/core/knowledge-base/citers.js';

describe('Full KB pipeline integration (2.3.0)', () => {
  let tmpProject: string;
  let vaultRoot: string;
  let legacyIncidentPath: string;
  let playbookPath: string;

  beforeEach(async () => {
    tmpProject = await mkdtemp(join(tmpdir(), 'hewtd-pipeline-'));
    vaultRoot = join(tmpProject, '.documentation/knowledge-base');

    // Set up the vault structure
    await mkdir(join(vaultRoot, 'facts'), { recursive: true });
    await mkdir(join(vaultRoot, 'incidents'), { recursive: true });

    // Legacy flat-file incident already under incidents/ — common shape for
    // users mid-migration to the folder convention.
    legacyIncidentPath = join(vaultRoot, 'incidents', '2026-05-14-vault-alloy-stuck.md');
    await writeFile(
      legacyIncidentPath,
      `---
title: Vault Down on Auth-Staging
domains: [incidents, observability]
status: active
last_updated: '2026-05-14'
severity: high
resolution_status: resolved
components: [vault, alloy, grafana]
---

# Vault Down on Auth-Staging

## Timeline
- 14:02 — Grafana alert fired
- 14:05 — Investigated: Vault healthy
- 14:15 — Alloy scrape worker stuck
- 14:18 — Restarted Alloy

## Root Cause
Grafana Alloy's scrape worker hung on a stale connection.

## Resolution
Restarted the Alloy container.

## Lessons Learned
Alloy reads env at entrypoint only.
`,
      'utf-8'
    );

    // Set up an existing playbook
    playbookPath = join(tmpProject, '.documentation/devops/grafana-runbook.md');
    await mkdir(join(tmpProject, '.documentation/devops'), { recursive: true });
    await writeFile(
      playbookPath,
      `---
title: Grafana Runbook
tier: admin
domains: [observability]
status: active
last_updated: '2026-05-14'
version: '1.0.0'
---

# Grafana Runbook

## Vault Down — auth-staging

1. Verify Vault directly: \`curl https://vault.../v1/sys/health\`
2. If Vault is healthy, check Alloy.
3. Restart Alloy if needed.
`,
      'utf-8'
    );
  });

  afterEach(async () => {
    await rm(tmpProject, { recursive: true, force: true });
  });

  it('runs the full pipeline end-to-end', async () => {
    // === Step 1: migrate-incident ===
    const migration = await migrateIncident({ flatFilePath: legacyIncidentPath, vaultRoot });
    expect(migration.action).toBe('migrated');

    const incidentFolder = migration.targetFolder;
    expect(existsSync(join(incidentFolder, 'narrative.md'))).toBe(true);
    expect(existsSync(join(incidentFolder, 'facts.md'))).toBe(true);
    expect(existsSync(join(incidentFolder, 'evidence'))).toBe(true);

    // Original file renamed for rollback
    expect(existsSync(`${legacyIncidentPath}.migrated`)).toBe(true);
    expect(existsSync(legacyIncidentPath)).toBe(false);

    // === Step 2: extract-facts (writer side) ===
    const extraction = await extractFacts({
      incidentFolder,
      vaultRoot,
      projectRoot: tmpProject,
      accept: [
        {
          id: 'alloy-env-set-at-entrypoint-only',
          title: 'Alloy reads env only at entrypoint',
          confidence: 'high',
          claim: 'Grafana Alloy reads env vars at entrypoint; does not refresh.',
          howToVerify: '`docker exec alloy printenv VAR` after restart.',
          consequences: 'Updating .env requires a restart.',
          verifyCommand: 'docker exec alloy printenv VAULT_TOKEN | head -c 10',
        },
      ],
    });

    expect(extraction.extractedFacts).toHaveLength(1);
    expect(extraction.extractedFacts[0]!.action).toBe('created');
    expect(extraction.factsMdUpdated).toBe(true);

    // The facts.md `produced:` list now includes the new fact
    const factsMd = await readFile(join(incidentFolder, 'facts.md'), 'utf-8');
    expect(factsMd).toContain('alloy-env-set-at-entrypoint-only');

    // === Step 3: cite (enrich the playbook) ===
    const citation = await cite({
      playbookPath,
      factId: 'alloy-env-set-at-entrypoint-only',
    });

    // The playbook had no symptoms: block, so cite created one
    expect(citation.action).toBe('created_block');

    const playbookAfter = await readFile(playbookPath, 'utf-8');
    expect(playbookAfter).toContain('symptoms:');
    expect(playbookAfter).toContain('alloy-env-set-at-entrypoint-only');

    // === Step 4: audit-facts (clean — fact was just verified) ===
    const index = await buildCiterIndex({
      projectRoot: tmpProject,
      vaultRoot,
      playbookGlobs: [resolve(tmpProject, '.documentation/**/*.md')],
    });

    expect(index.facts.size).toBe(1);
    expect(index.incidents.size).toBe(1);

    const audit = auditFacts({
      index,
      now: new Date(), // today
      auditWindowDays: 90,
    });
    expect(audit.stale).toEqual([]); // fact just created with today's last_verified

    // === Step 5: find-citers ===
    const citers = findCitersInIndex(index, 'alloy-env-set-at-entrypoint-only');
    expect(citers.fact_exists).toBe(true);
    // Note: the playbook's symptoms block was auto-created with TODO placeholders,
    // so it cites the fact and shows up as a citer.
    expect(citers.citers.length).toBeGreaterThan(0);
    expect(citers.incidents_produced_in).toContain(migration.targetFolder.split('/').pop()!);
  });

  it('re-running each step is idempotent', async () => {
    // Migrate twice
    await migrateIncident({ flatFilePath: legacyIncidentPath, vaultRoot });
    // Plant a stale flat file (simulating user re-running by mistake)
    await writeFile(legacyIncidentPath, '---\ntitle: Stale\n---\n# Stale\n', 'utf-8');
    const second = await migrateIncident({ flatFilePath: legacyIncidentPath, vaultRoot });
    expect(second.action).toBe('already_migrated');

    // Extract the same fact twice
    const incidentFolder = second.targetFolder;
    const accept = [
      {
        id: 'test-fact',
        title: 'Test',
        confidence: 'high' as const,
        claim: 'A claim.',
      },
    ];
    await extractFacts({ incidentFolder, vaultRoot, projectRoot: tmpProject, accept });
    const secondExtract = await extractFacts({
      incidentFolder,
      vaultRoot,
      projectRoot: tmpProject,
      accept,
    });
    expect(secondExtract.extractedFacts[0]!.action).toBe('already_exists');
  });
});
