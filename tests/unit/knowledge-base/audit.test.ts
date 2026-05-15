import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { buildCiterIndex } from '../../../src/core/knowledge-base/citers.js';
import { auditFacts, runFactVerify } from '../../../src/core/knowledge-base/audit.js';

const VALID_FIXTURE_ROOT = resolve(__dirname, '../../fixtures/knowledge-base/valid');

describe('auditFacts (2.3.0)', () => {
  it('identifies stale facts past audit_window_days', async () => {
    const index = await buildCiterIndex({
      projectRoot: VALID_FIXTURE_ROOT,
      vaultRoot: VALID_FIXTURE_ROOT,
      playbookGlobs: [resolve(VALID_FIXTURE_ROOT, 'playbooks/*.md')],
    });

    // The fixture fact has last_verified: 2026-05-14. Pretend "now" is 200 days later.
    const now = new Date('2026-11-30T00:00:00Z');
    const result = auditFacts({ index, now, auditWindowDays: 90 });

    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]!.id).toBe('alloy-env-set-at-entrypoint-only');
    expect(result.stale[0]!.daysSinceVerified).toBeGreaterThanOrEqual(180);
  });

  it('returns no stale facts when within audit_window_days', async () => {
    const index = await buildCiterIndex({
      projectRoot: VALID_FIXTURE_ROOT,
      vaultRoot: VALID_FIXTURE_ROOT,
      playbookGlobs: [resolve(VALID_FIXTURE_ROOT, 'playbooks/*.md')],
    });

    // 30 days after verification — well inside window
    const now = new Date('2026-06-13T00:00:00Z');
    const result = auditFacts({ index, now, auditWindowDays: 90 });

    expect(result.stale).toHaveLength(0);
    expect(result.unverifiable).toHaveLength(0);
  });

  it('sorts stale facts by daysSinceVerified desc, id asc', async () => {
    const index = await buildCiterIndex({
      projectRoot: VALID_FIXTURE_ROOT,
      vaultRoot: VALID_FIXTURE_ROOT,
      playbookGlobs: [resolve(VALID_FIXTURE_ROOT, 'playbooks/*.md')],
    });

    // Inject a couple more facts with different last_verified dates,
    // both well past 90-day window when "now" = 2026-08-01.
    index.facts.set('fact-newer-stale', {
      id: 'fact-newer-stale',
      path: '/tmp/newer.md',
      relPath: 'facts/newer.md',
      title: 'Newer stale',
      confidence: 'medium',
      lastVerified: '2026-04-01',
      tags: [],
    });
    index.facts.set('fact-older-stale', {
      id: 'fact-older-stale',
      path: '/tmp/older.md',
      relPath: 'facts/older.md',
      title: 'Older stale',
      confidence: 'medium',
      lastVerified: '2026-01-01',
      tags: [],
    });

    // Note: the fixture's alloy-env fact was verified 2026-05-14, only ~79
    // days before 2026-08-01, so it's NOT stale at the 90-day window. Order
    // contains only the two injected facts.
    const now = new Date('2026-08-01T00:00:00Z');
    const result = auditFacts({ index, now, auditWindowDays: 90 });

    expect(result.stale.map((s) => s.id)).toEqual([
      'fact-older-stale',
      'fact-newer-stale',
    ]);
  });
});

describe('runFactVerify (2.3.0)', () => {
  let tmpVault: string;
  let factPath: string;

  beforeEach(async () => {
    tmpVault = await mkdtemp(join(tmpdir(), 'hewtd-verify-'));
    await mkdir(join(tmpVault, 'facts'), { recursive: true });
    factPath = join(tmpVault, 'facts', 'test-verify.md');
  });

  afterEach(async () => {
    await rm(tmpVault, { recursive: true, force: true });
  });

  it('updates last_verified when verify_command succeeds', async () => {
    await writeFile(
      factPath,
      `---
title: Test fact
tier: fact
domains: [test]
status: active
last_updated: '2025-01-01'
id: test-verify
confidence: high
last_verified: '2025-01-01'
verify_command: |
  echo "ok"
provenance:
  - test/
---

# Test fact
`,
      'utf-8'
    );

    const fact = {
      id: 'test-verify',
      path: factPath,
      relPath: 'facts/test-verify.md',
      title: 'Test fact',
      confidence: 'high' as const,
      lastVerified: '2025-01-01',
      tags: [],
    };

    const now = new Date('2026-05-14T12:00:00Z');
    const result = await runFactVerify({
      fact,
      vaultRoot: tmpVault,
      now,
    });

    expect(result.updated).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.newLastVerified).toBe('2026-05-14');

    const updated = await readFile(factPath, 'utf-8');
    expect(updated).toContain("last_verified: '2026-05-14'");
  });

  it('does NOT update last_verified when verify_command fails', async () => {
    await writeFile(
      factPath,
      `---
title: Failing verify
tier: fact
domains: [test]
status: active
last_updated: '2025-01-01'
id: test-verify
confidence: high
last_verified: '2025-01-01'
verify_command: |
  exit 1
provenance:
  - test/
---

# Failing verify
`,
      'utf-8'
    );

    const fact = {
      id: 'test-verify',
      path: factPath,
      relPath: 'facts/test-verify.md',
      title: 'Failing verify',
      confidence: 'high' as const,
      lastVerified: '2025-01-01',
      tags: [],
    };

    const result = await runFactVerify({
      fact,
      vaultRoot: tmpVault,
    });

    expect(result.updated).toBe(false);
    expect(result.exitCode).toBe(1);

    const original = await readFile(factPath, 'utf-8');
    expect(original).toContain("last_verified: '2025-01-01'"); // unchanged
  });

  it('returns "no verify_command defined" when the field is absent', async () => {
    await writeFile(
      factPath,
      `---
title: No verify
tier: fact
domains: [test]
status: active
last_updated: '2025-01-01'
id: test-verify
confidence: high
last_verified: '2025-01-01'
provenance:
  - test/
---

# No verify
`,
      'utf-8'
    );

    const fact = {
      id: 'test-verify',
      path: factPath,
      relPath: 'facts/test-verify.md',
      title: 'No verify',
      confidence: 'high' as const,
      lastVerified: '2025-01-01',
      tags: [],
    };

    const result = await runFactVerify({
      fact,
      vaultRoot: tmpVault,
    });

    expect(result.executed).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.stderr).toContain('no verify_command defined');
  });
});
