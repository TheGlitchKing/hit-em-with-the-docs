import { describe, it, expect } from 'vitest';
import { extractLinks } from '../../../src/utils/markdown.js';

/**
 * Link-shaped text inside a fenced block or a code span is an EXAMPLE, not a link.
 * Reporting it as broken inflates the broken-link count on docs that are correct, which
 * trains people to ignore the number.
 */
describe('extractLinks skips code', () => {
  it('ignores links inside a fenced block', () => {
    const md = [
      'Real: [a](./a.md)',
      '',
      '```markdown',
      '![img](`../assets/example.png`)',
      '[example](./not-a-real-file.md)',
      '```',
      '',
      'Also real: [b](./b.md)',
    ].join('\n');

    expect(extractLinks(md).map((l) => l.url)).toEqual(['./a.md', './b.md']);
  });

  it('ignores links inside inline code spans', () => {
    const md = 'Use the `[text](./path.md)` form, e.g. [real](./real.md).';

    expect(extractLinks(md).map((l) => l.url)).toEqual(['./real.md']);
  });

  it('keeps lineNumber and startIndex accurate for a real link beside a code span', () => {
    // The span is BLANKED with spaces rather than removed, so offsets still line up.
    const md = ['intro', 'see `[x](./x.md)` and [y](./y.md)'].join('\n');

    const links = extractLinks(md);
    expect(links).toHaveLength(1);

    const link = links[0]!;
    expect(link.url).toBe('./y.md');
    expect(link.lineNumber).toBe(2);

    // The offset must index into the ORIGINAL line, not the blanked copy.
    const line = md.split('\n')[1]!;
    expect(line.slice(link.startIndex, link.endIndex)).toBe('[y](./y.md)');
  });

  it('handles ~~~ fences and longer backtick runs', () => {
    const md = ['~~~', '[in-tilde](./nope.md)', '~~~', '````', '[in-four](./nope2.md)', '````', '[ok](./ok.md)'].join('\n');

    expect(extractLinks(md).map((l) => l.url)).toEqual(['./ok.md']);
  });
});
