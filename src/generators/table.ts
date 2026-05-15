/**
 * Deterministic markdown table formatter (2.3.0).
 *
 * Pads columns to the max width per column so diffs stay clean as rows
 * are added/removed. Uses `\n` line endings explicitly.
 */

export function formatMarkdownTable(
  headers: string[],
  rows: string[][]
): string {
  const widths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = row[i] ?? '';
      if (cell.length > max) max = cell.length;
    }
    return max;
  });

  const pad = (cell: string, width: number): string => cell.padEnd(width, ' ');

  const headerLine = `| ${headers.map((h, i) => pad(h, widths[i]!)).join(' | ')} |`;
  const sepLine = `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`;
  const bodyLines = rows.map(
    (row) =>
      `| ${row.map((cell, i) => pad(cell ?? '', widths[i]!)).join(' | ')} |`
  );

  return [headerLine, sepLine, ...bodyLines].join('\n');
}
