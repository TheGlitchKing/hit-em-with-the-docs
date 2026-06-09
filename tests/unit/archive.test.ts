import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { findMarkdownFiles, ARCHIVE_DIR } from '../../src/utils/glob.js';
import { createScaffold } from '../../src/generators/scaffold.js';
import { auditDocumentation } from '../../src/core/audit/auditor.js';
import { resetRegistry } from '../../src/core/domains/registry.js';

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe('archive/ — deprecated-docs convention', () => {
  let docsPath: string;
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await mkdtemp(join(tmpdir(), 'hewtd-archive-'));
    docsPath = join(tmpDir, '.documentation');
    process.chdir(tmpDir);
    resetRegistry();
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    resetRegistry();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('scaffold creates an archive/ folder with an instructional README', async () => {
    await createScaffold({ rootPath: docsPath, silent: true });
    expect(await exists(join(docsPath, ARCHIVE_DIR))).toBe(true);
    expect(await exists(join(docsPath, ARCHIVE_DIR, 'README.md'))).toBe(true);
  });

  it('findMarkdownFiles excludes everything under archive/', async () => {
    await mkdir(join(docsPath, 'security'), { recursive: true });
    await mkdir(join(docsPath, ARCHIVE_DIR, 'security'), { recursive: true });
    await writeFile(join(docsPath, 'security', 'live.md'), '# live\n', 'utf-8');
    await writeFile(join(docsPath, ARCHIVE_DIR, 'old.md'), '# old\n', 'utf-8');
    await writeFile(
      join(docsPath, ARCHIVE_DIR, 'security', 'nested-old.md'),
      '# nested\n',
      'utf-8'
    );

    const files = await findMarkdownFiles(docsPath);
    expect(files.some((f) => f.endsWith('live.md'))).toBe(true);
    expect(files.some((f) => f.includes(`/${ARCHIVE_DIR}/`))).toBe(false);
  });

  it('audit does not flag a malformed doc parked in archive/', async () => {
    await createScaffold({ rootPath: docsPath, silent: true });
    // A doc with deliberately broken frontmatter — would fail audit if scanned.
    await writeFile(
      join(docsPath, ARCHIVE_DIR, 'retired-guide.md'),
      `---\ntitle: Retired\n---\n# Retired guide with no valid tier/domains\n`,
      'utf-8'
    );

    const result = await auditDocumentation({ docsPath, silent: true });
    const flaggedArchive = result.issues.some((i) =>
      i.file.includes(`${ARCHIVE_DIR}/`)
    );
    expect(flaggedArchive).toBe(false);
  });
});
