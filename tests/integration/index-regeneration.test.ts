/**
 * Index regeneration integration tests (2.5.0).
 *
 * Regression coverage for issue #7 — `integrate` could only append a row to
 * an already-populated INDEX.md table, so the FIRST document into a freshly
 * scaffolded domain was never registered (and the failure was swallowed).
 *
 * Verifies the 2.5.0 fix end-to-end against temp trees:
 *   - integrate registers the first doc into a domain
 *   - regenerateIndexes() rebuilds domain + root indexes from disk
 *   - maintain self-heals stale indexes
 *   - audit flags INDEX.md drift, and the flag clears after regeneration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { createScaffold } from '../../src/generators/scaffold.js';
import { integrateDocument } from '../../src/core/integrate/integrator.js';
import { regenerateIndexes } from '../../src/generators/regenerate.js';
import { runMaintenance } from '../../src/core/maintain/orchestrator.js';
import { auditDocumentation } from '../../src/core/audit/auditor.js';

describe('Index regeneration (2.5.0 — issue #7)', () => {
  let tmpProject: string;
  let docsPath: string;

  beforeEach(async () => {
    tmpProject = await mkdtemp(join(tmpdir(), 'hewtd-index-'));
    docsPath = join(tmpProject, '.documentation');
    await createScaffold({ rootPath: docsPath, overwrite: false, silent: true });
  });

  afterEach(async () => {
    await rm(tmpProject, { recursive: true, force: true });
  });

  it('registers the FIRST document integrated into a domain', async () => {
    // A freshly scaffolded domain INDEX.md has no table — the exact case the
    // old regex-append path silently no-op'd on.
    const srcPath = join(tmpProject, 'auth-setup.md');
    await writeFile(
      srcPath,
      `---
title: Authentication Setup Guide
---

# Authentication Setup Guide

How to configure authentication, authorization, OAuth, JWT tokens,
login security, and access control for the service.
`,
      'utf-8'
    );

    const result = await integrateDocument({
      filePath: srcPath,
      docsPath,
      auto: true,
      force: true,
      silent: true,
    });

    expect(result.success).toBe(true);
    expect(result.integrated).toBe(true);
    expect(result.domain).toBeDefined();

    // The resolved domain's INDEX.md must now list the integrated document.
    const indexPath = join(docsPath, result.domain!, 'INDEX.md');
    const indexContent = await readFile(indexPath, 'utf-8');
    expect(indexContent).toContain('auth-setup.md');
    expect(indexContent).toContain('Authentication Setup Guide');
    expect(indexContent).toContain('| Document |');
    expect(indexContent).not.toContain('*No documents in this domain yet.*');
  });

  it('regenerateIndexes() rebuilds domain + root indexes from disk', async () => {
    // Drop two documents straight into a domain — no integrate, no reindex.
    await writeFile(
      join(docsPath, 'security', 'one.md'),
      `---\ntitle: Doc One\ntier: guide\nstatus: active\nlast_updated: '2026-05-16'\n---\n# One\n`,
      'utf-8'
    );
    await writeFile(
      join(docsPath, 'security', 'two.md'),
      `---\ntitle: Doc Two\ntier: reference\nstatus: active\nlast_updated: '2026-05-16'\n---\n# Two\n`,
      'utf-8'
    );

    const result = await regenerateIndexes({ docsPath, silent: true });

    expect(result.documentCounts.security).toBe(2);
    expect(result.totalDocuments).toBe(2);
    // 15 domains × INDEX+REGISTRY + root INDEX+REGISTRY.
    expect(result.filesWritten).toHaveLength(15 * 2 + 2);

    const domainIndex = await readFile(join(docsPath, 'security', 'INDEX.md'), 'utf-8');
    expect(domainIndex).toContain('Doc One');
    expect(domainIndex).toContain('Doc Two');
    expect(domainIndex).toContain('**Total Documents:** 2');

    const rootIndex = await readFile(join(docsPath, 'INDEX.md'), 'utf-8');
    expect(rootIndex).toMatch(/\[Security\]\(#security\) \| 2 /);
  });

  it('maintain self-heals stale domain indexes', async () => {
    await writeFile(
      join(docsPath, 'database', 'schema-notes.md'),
      `---\ntitle: Schema Notes\ntier: reference\nstatus: active\nlast_updated: '2026-05-16'\n---\n# Schema\n`,
      'utf-8'
    );

    // Scaffolded INDEX.md does not list the new doc yet.
    const before = await readFile(join(docsPath, 'database', 'INDEX.md'), 'utf-8');
    expect(before).not.toContain('schema-notes.md');

    await runMaintenance({ docsPath, quick: true, silent: true });

    const after = await readFile(join(docsPath, 'database', 'INDEX.md'), 'utf-8');
    expect(after).toContain('schema-notes.md');
    expect(after).toContain('Schema Notes');
  });

  it('audit flags INDEX.md drift and the flag clears after regeneration', async () => {
    await writeFile(
      join(docsPath, 'testing', 'e2e-strategy.md'),
      `---\ntitle: E2E Strategy\ntier: guide\nstatus: active\nlast_updated: '2026-05-16'\n---\n# E2E\n`,
      'utf-8'
    );

    const drifted = await auditDocumentation({ docsPath, silent: true });
    const driftIssue = drifted.issues.find(
      (i) => i.rule === 'index-drift' && i.file === 'testing/INDEX.md'
    );
    expect(driftIssue).toBeDefined();
    expect(driftIssue?.severity).toBe('error');
    expect(driftIssue?.fixable).toBe(true);

    await regenerateIndexes({ docsPath, silent: true });

    const clean = await auditDocumentation({ docsPath, silent: true });
    expect(clean.issues.some((i) => i.rule === 'index-drift')).toBe(false);
  });
});
