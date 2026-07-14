/**
 * Archive scan exclusion (2.8.0).
 *
 * The policy: archived content is **referenceable but never concrete**. A link
 * into the archive still resolves — history stays reachable — but nothing under
 * an `archive/` folder is part of the active corpus. It is not indexed, not
 * audited, not metadata-validated, not dup-checked, and never counted.
 *
 * Before 2.8.0 the ignore glob was anchored at the docs root (`archive/**`), so
 * a NESTED archive folder was still scanned and validated, while 2.7.1's indexer
 * correctly skipped it. Retired docs could raise audit errors for content nobody
 * was supposed to be reading.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { findMarkdownFiles } from '../../../src/utils/glob.js';
import { auditDocumentation } from '../../../src/core/audit/auditor.js';
import { checkLinks } from '../../../src/core/links/checker.js';

describe('archive/ is excluded from every scan, at any depth', () => {
  let tmpProject: string;
  let docsPath: string;

  beforeEach(async () => {
    tmpProject = await mkdtemp(join(tmpdir(), 'hewtd-archive-'));
    docsPath = join(tmpProject, '.documentation');

    const doc = (title: string, body = '') =>
      `---\ntitle: ${title}\ntier: guide\ndomains:\n  - api\nstatus: active\n` +
      `last_updated: '2026-07-14'\nversion: 1.0.0\n---\n\n# ${title}\n\n${body}\n`;

    await mkdir(join(docsPath, 'api'), { recursive: true });
    await mkdir(join(docsPath, 'archive', 'api'), { recursive: true });
    await mkdir(join(docsPath, 'features', 'archive'), { recursive: true });

    // An active doc that LINKS INTO the archive — history must stay reachable.
    await writeFile(
      join(docsPath, 'api', 'current.md'),
      doc('Current Guide', 'Superseded the [old approach](../archive/api/old.md).'),
      'utf-8'
    );
    // Top-level archive (excluded before 2.8.0 too).
    await writeFile(join(docsPath, 'archive', 'api', 'old.md'), doc('Old Guide'), 'utf-8');
    // NESTED archive — this is the one that used to leak into scans.
    await writeFile(
      join(docsPath, 'features', 'archive', 'retired.md'),
      doc('Retired Feature'),
      'utf-8'
    );
  });

  afterEach(async () => {
    await rm(tmpProject, { recursive: true, force: true });
  });

  it('the corpus scanner skips archived docs at every depth', async () => {
    const files = (await findMarkdownFiles(docsPath)).map((f) => relative(docsPath, f));

    expect(files).toContain(join('api', 'current.md'));
    expect(files.some((f) => f.includes('archive'))).toBe(false);
  });

  it('audit never validates archived content', async () => {
    const result = await auditDocumentation({ docsPath, silent: true });

    // No issue may be attributed to a file under an archive/ folder — an
    // archived doc's stale frontmatter is not a problem to be reported.
    const archiveIssues = result.issues.filter((i) => i.file?.includes('archive'));
    expect(archiveIssues).toEqual([]);
  });

  it('a link INTO the archive still resolves — referenceable, just not concrete', async () => {
    const result = await checkLinks({ docsPath, silent: true });

    const brokenIntoArchive = result.brokenLinks.filter((b) =>
      b.targetPath.includes('archive')
    );
    expect(brokenIntoArchive).toEqual([]);
  });
});
