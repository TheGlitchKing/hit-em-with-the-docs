/**
 * Lifecycle enforcement guard (2.8.0).
 *
 * This is the only part of hewtd that can DENY a tool call, so the tests care
 * as much about what it lets through as about what it stops. A guard that
 * over-fires gets disabled, and a disabled guard enforces nothing.
 */

import { describe, it, expect } from 'vitest';
import { evaluate, DEFAULT_ENFORCEMENT } from '../../../src/core/enforce/guard.js';

const docsDir = '.documentation';
const ev = (input: Parameters<typeof evaluate>[0], policy = DEFAULT_ENFORCEMENT) =>
  evaluate({ docsDir, ...input }, policy);

describe('guard — only denies indexes hewtd actually generates', () => {
  // hewtd writes `<docs>/INDEX.md` and `<docs>/<domain>/INDEX.md` and nothing else
  // (core/maintain/orchestrator.ts joins docsPath with a single domain segment).
  // Denying by basename alone froze every hand-written sub-feature index: the deny is
  // final, and the "run `hewtd index`" advice it offered does nothing to those files.

  it('denies the root and domain-level indexes', () => {
    for (const f of [
      '.documentation/INDEX.md',
      '.documentation/REGISTRY.md',
      '.documentation/api/INDEX.md',
      '.documentation/knowledge-base/REGISTRY.md',
    ]) {
      expect(ev({ toolName: 'Edit', filePath: f }).action).toBe('deny');
    }
  });

  it('allows a hand-written index below domain level', () => {
    // These are prose that merely share the name. hewtd has never written one:
    // `hewtd index` leaves them byte-identical.
    for (const f of [
      '.documentation/features/tiers/INDEX.md',
      '.documentation/knowledge-base/symptoms/INDEX.md',
      '.documentation/standards/testing/INDEX.md',
      '.documentation/agents/diane/INDEX.md',
    ]) {
      expect(ev({ toolName: 'Edit', filePath: f }).action).toBe('allow');
    }
  });

  it('uses the supplied domain list, so a slash-containing custom domain still denies', () => {
    const filePath = '.documentation/features/tiers/INDEX.md';
    // Default (no list): one segment below the root is generated, deeper is not.
    expect(ev({ toolName: 'Edit', filePath }).action).toBe('allow');
    // Declared as a domain by this project => hewtd does generate it => deny.
    expect(
      evaluate({ docsDir, toolName: 'Edit', filePath, domains: ['features/tiers'] }).action
    ).toBe('deny');
  });

  it('applies to absolute paths too', () => {
    expect(
      ev({ toolName: 'Edit', filePath: '/home/u/proj/.documentation/api/INDEX.md' }).action
    ).toBe('deny');
    expect(
      ev({ toolName: 'Edit', filePath: '/home/u/proj/.documentation/features/tiers/INDEX.md' })
        .action
    ).toBe('allow');
  });
});

describe('guard — denies the destructive cases', () => {
  it('denies editing a generated INDEX.md', () => {
    const d = ev({ toolName: 'Edit', filePath: '.documentation/api/INDEX.md' });
    expect(d.action).toBe('deny');
    expect(d.action === 'deny' && d.reason).toMatch(/generated artifact/i);
    expect(d.action === 'deny' && d.reason).toMatch(/hewtd index/);
  });

  it('denies writing a generated REGISTRY.md, at the root and at domain level', () => {
    expect(ev({ toolName: 'Write', filePath: '.documentation/REGISTRY.md' }).action).toBe('deny');
    expect(ev({ toolName: 'Write', filePath: '.documentation/standards/REGISTRY.md' }).action).toBe(
      'deny'
    );
  });

  it('denies rm of a doc under the docs tree, and names the archive alternative', () => {
    const d = ev({ toolName: 'Bash', command: 'rm .documentation/api/old-guide.md' });
    expect(d.action).toBe('deny');
    expect(d.action === 'deny' && d.reason).toMatch(/hewtd archive/);
    expect(d.action === 'deny' && d.reason).toMatch(/unarchive/);
  });

  it('denies the other ways to destroy a file', () => {
    for (const cmd of [
      'git rm .documentation/api/x.md',
      'rm -f .documentation/api/x.md',
      'rm -rf .documentation/api/x.md',
      'shred .documentation/api/x.md',
      'cd /tmp && rm .documentation/api/x.md',
      'echo hi; rm .documentation/api/x.md',
      'true && rm .documentation/api/x.md',
    ]) {
      expect(ev({ toolName: 'Bash', command: cmd }).action, cmd).toBe('deny');
    }
  });
});

describe('guard — warns without blocking', () => {
  it('warns when a doc is marked deprecated but not archived', () => {
    const d = ev({
      toolName: 'Edit',
      filePath: '.documentation/api/old.md',
      text: 'status: deprecated',
    });
    expect(d.action).toBe('warn');
    expect(d.action === 'warn' && d.context).toMatch(/hewtd archive/);
  });

  it('warns when a rival docs/ tree is started', () => {
    const d = ev({ toolName: 'Write', filePath: 'docs/my-notes.md' });
    expect(d.action).toBe('warn');
    expect(d.action === 'warn' && d.context).toMatch(/hewtd integrate/);

    // …and on a loose doc dropped at the repo root.
    expect(ev({ toolName: 'Write', filePath: 'architecture-notes.md' }).action).toBe('warn');
  });

  it('warns on a hand-rolled mv into archive/ (it loses archived_from)', () => {
    const d = ev({
      toolName: 'Bash',
      command: 'mv .documentation/api/old.md .documentation/archive/api/old.md',
    });
    expect(d.action).toBe('warn');
    expect(d.action === 'warn' && d.context).toMatch(/archived_from/);
  });
});

describe('guard — archived content is referenceable, never concrete', () => {
  it('warns when editing an archived doc, at any depth', () => {
    for (const f of [
      '.documentation/archive/api/old.md',
      '.documentation/features/archive/retired.md',
    ]) {
      const d = ev({ toolName: 'Edit', filePath: f });
      expect(d.action, f).toBe('warn');
      expect(d.action === 'warn' && d.context).toMatch(/historical/i);
      expect(d.action === 'warn' && d.context).toMatch(/unarchive/);
    }
  });

  it('warns rather than denies — editing history is pointless, not destructive', () => {
    const d = ev({ toolName: 'Write', filePath: '.documentation/archive/api/old.md' });
    expect(d.action).not.toBe('deny');
  });

  it('still denies DELETING an archived doc', () => {
    // Archived ≠ disposable. The archive is the thing that makes retirement
    // reversible; deleting out of it throws away the history it exists to hold.
    const d = ev({ toolName: 'Bash', command: 'rm .documentation/archive/api/old.md' });
    expect(d.action).toBe('deny');
  });

  it("does not claim an archive/ folder outside the docs tree", () => {
    expect(ev({ toolName: 'Write', filePath: 'src/archive/notes.md' }).action).toBe('allow');
  });
});

describe('guard — does not over-fire', () => {
  it('allows editing an ordinary document', () => {
    expect(ev({ toolName: 'Edit', filePath: '.documentation/api/guide.md' }).action).toBe('allow');
  });

  it('allows an INDEX.md that has nothing to do with the docs tree', () => {
    // Someone else's INDEX.md is not hewtd's business.
    expect(ev({ toolName: 'Write', filePath: 'src/INDEX.md' }).action).toBe('allow');
  });

  it('stays silent on markdown that is plainly not documentation', () => {
    // The warn is narrow on purpose: a noisy guard is a disabled guard.
    for (const f of [
      'src/components/Button.md',
      'tests/fixtures/sample.md',
      'packages/ui/README.md',
      'templates/thing.template.md',
    ]) {
      expect(ev({ toolName: 'Write', filePath: f }).action, f).toBe('allow');
    }
  });

  it('does not nag about a project README, CHANGELOG, or planning file', () => {
    for (const f of [
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'CLAUDE.md',
      'AGENTS.md',
      '.planning/some-phase/phase.md',
      '.claude/notes.md',
      'node_modules/foo/README.md',
    ]) {
      expect(ev({ toolName: 'Write', filePath: f }).action, f).toBe('allow');
    }
  });

  it('allows rm of files that are not docs', () => {
    for (const cmd of [
      'rm src/index.ts',
      'rm -rf dist',
      'rm /tmp/scratch.md',
      'npm run build',
    ]) {
      expect(ev({ toolName: 'Bash', command: cmd }).action, cmd).toBe('allow');
    }
  });

  it("allows hewtd's own commands, including archive", () => {
    for (const cmd of [
      'hewtd archive .documentation/api/old.md',
      'npx hit-em-with-the-docs index',
      'hewtd maintain --fix',
    ]) {
      expect(ev({ toolName: 'Bash', command: cmd }).action, cmd).toBe('allow');
    }
  });

  it('ignores tools it has no opinion about', () => {
    expect(ev({ toolName: 'Read', filePath: '.documentation/api/INDEX.md' }).action).toBe('allow');
    expect(ev({ toolName: 'Grep', filePath: '.documentation/api/INDEX.md' }).action).toBe('allow');
  });
});

describe('guard — the escape hatch', () => {
  it('respects block_index_edits: false', () => {
    const d = ev(
      { toolName: 'Edit', filePath: '.documentation/api/INDEX.md' },
      { blockIndexEdits: false, blockDocDeletion: true }
    );
    expect(d.action).toBe('allow');
  });

  it('respects block_doc_deletion: false', () => {
    const d = ev(
      { toolName: 'Bash', command: 'rm .documentation/api/old.md' },
      { blockIndexEdits: true, blockDocDeletion: false }
    );
    expect(d.action).toBe('allow');
  });

  it('disabling one rule does not disable the other', () => {
    const policy = { blockIndexEdits: false, blockDocDeletion: true };
    expect(ev({ toolName: 'Bash', command: 'rm .documentation/a.md' }, policy).action).toBe('deny');
  });
});
