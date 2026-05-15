import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { buildCiterIndex } from '../../../src/core/knowledge-base/citers.js';
import { renderFactsIndex } from '../../../src/generators/facts-index.js';
import { renderIncidentsIndex } from '../../../src/generators/incidents-index.js';
import { renderSymptomsIndex } from '../../../src/generators/symptoms-index.js';

const VALID_FIXTURE_ROOT = resolve(__dirname, '../../fixtures/knowledge-base/valid');

async function buildIndex() {
  return buildCiterIndex({
    projectRoot: VALID_FIXTURE_ROOT,
    vaultRoot: VALID_FIXTURE_ROOT,
    playbookGlobs: [resolve(VALID_FIXTURE_ROOT, 'playbooks/*.md')],
  });
}

describe('renderFactsIndex (2.3.0)', () => {
  it('produces deterministic, byte-identical output across runs', async () => {
    const index = await buildIndex();
    const out1 = renderFactsIndex(index);
    const out2 = renderFactsIndex(index);
    expect(out1).toBe(out2);
  });

  it('snapshot for the valid fixture', async () => {
    const index = await buildIndex();
    expect(renderFactsIndex(index)).toMatchSnapshot();
  });

  it('emits "no facts yet" message when index is empty', async () => {
    const empty = await buildCiterIndex({
      projectRoot: '/tmp',
      vaultRoot: '/tmp/nonexistent',
      playbookGlobs: [],
    });
    const out = renderFactsIndex(empty);
    expect(out).toContain('No facts yet');
    // Still has well-formed frontmatter
    expect(out.startsWith('---\n')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('uses \\n line endings only (no \\r\\n)', async () => {
    const index = await buildIndex();
    const out = renderFactsIndex(index);
    expect(out.includes('\r')).toBe(false);
  });

  it('starts with frontmatter and ends with a single trailing newline', async () => {
    const index = await buildIndex();
    const out = renderFactsIndex(index);
    expect(out.startsWith('---\n')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });
});

describe('renderIncidentsIndex (2.3.0)', () => {
  it('produces deterministic output across runs', async () => {
    const index = await buildIndex();
    expect(renderIncidentsIndex(index)).toBe(renderIncidentsIndex(index));
  });

  it('snapshot for the valid fixture', async () => {
    const index = await buildIndex();
    expect(renderIncidentsIndex(index)).toMatchSnapshot();
  });

  it('sorts by date descending', async () => {
    const index = await buildIndex();
    // Manually inject a second, older incident to verify sort order.
    index.incidents.set('2026-04-01-test-older', {
      id: '2026-04-01-test-older',
      folderPath: '/tmp/older',
      relFolderPath: 'incidents/2026-04-01-test-older',
      title: 'Older Test Incident',
      date: '2026-04-01',
      severity: 'low',
      resolution_status: 'resolved',
      components: ['test'],
      produced: [],
      strengthened: [],
      weakened: [],
    });

    const out = renderIncidentsIndex(index);
    const newerIdx = out.indexOf('2026-05-14-vault-alloy-stuck');
    const olderIdx = out.indexOf('2026-04-01-test-older');
    expect(newerIdx).toBeGreaterThan(0);
    expect(olderIdx).toBeGreaterThan(0);
    expect(newerIdx).toBeLessThan(olderIdx); // newer appears first
  });

  it('emits "no incidents yet" message when index is empty', async () => {
    const empty = await buildCiterIndex({
      projectRoot: '/tmp',
      vaultRoot: '/tmp/nonexistent',
      playbookGlobs: [],
    });
    expect(renderIncidentsIndex(empty)).toContain('No incidents yet');
  });
});

describe('renderSymptomsIndex (2.3.0)', () => {
  it('produces deterministic output across runs', async () => {
    const index = await buildIndex();
    expect(renderSymptomsIndex(index)).toBe(renderSymptomsIndex(index));
  });

  it('snapshot for the valid fixture', async () => {
    const index = await buildIndex();
    expect(renderSymptomsIndex(index)).toMatchSnapshot();
  });

  it('groups by symptom kind (alert_name, user_phrase, error_pattern)', async () => {
    const index = await buildIndex();
    const out = renderSymptomsIndex(index);
    // Valid fixture has an alert_name and a user_phrase block.
    expect(out).toContain('## Alert names');
    expect(out).toContain('## User phrases');
  });

  it('emits "no symptoms" message when index has no citers', async () => {
    const empty = await buildCiterIndex({
      projectRoot: '/tmp',
      vaultRoot: '/tmp/nonexistent',
      playbookGlobs: [],
    });
    expect(renderSymptomsIndex(empty)).toContain('No symptoms blocks found');
  });
});
