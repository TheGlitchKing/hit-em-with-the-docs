/**
 * Markdown utilities for parsing and generating markdown content
 */

export interface MarkdownLink {
  text: string;
  url: string;
  title?: string;
  isInternal: boolean;
  lineNumber: number;
  startIndex: number;
  endIndex: number;
}

export interface MarkdownHeading {
  level: number;
  text: string;
  lineNumber: number;
}

/**
 * Extract all links from markdown content
 */
/** A tab counts as four columns when measuring block indentation. */
function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 4;
    else break;
  }
  return width;
}

/** `- item`, `* item`, `+ item`, `1. item`, `2) item`. */
function isListItem(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

interface Fence {
  marker: '`' | '~';
  length: number;
}

/**
 * A fence opener: three or more backticks or tildes, indented at most three
 * columns. At four it is indented code, not a fence.
 */
function openingFence(line: string): Fence | null {
  const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  const run = m?.[1];
  if (!run) return null;
  const marker = run[0] as '`' | '~';
  return { marker, length: run.length };
}

/**
 * A fence closes only on the same marker, at least as long as the opener, with
 * nothing after it. `````` inside a ``` block is content, not a close.
 */
function closesFence(line: string, fence: Fence): boolean {
  return new RegExp(`^ {0,3}\\${fence.marker}{${fence.length},}\\s*$`).test(line);
}

export function extractLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = content.split('\n');

  // Match markdown links: [text](url) or [text](url "title")
  const linkRegex = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

  // Link-shaped text inside code is an EXAMPLE, not a link. Reporting it as broken
  // trains people to ignore the broken-link count (#20). Three shapes of code:
  // fenced blocks, inline spans, and indented blocks.
  //
  // Spans are blanked with spaces rather than removed, so `startIndex` and
  // `lineNumber` stay accurate for every real link sharing the line.
  let fence: Fence | null = null;
  let inIndentedCode = false;
  let inList = false;
  let prevBlank = true; // start of document counts as a blank line

  lines.forEach((rawLine, lineIndex) => {
    if (fence) {
      if (closesFence(rawLine, fence)) fence = null;
      return; // fence body and its delimiters hold no links
    }

    const opener = openingFence(rawLine);
    if (opener) {
      fence = opener;
      inIndentedCode = false;
      return;
    }

    const blank = rawLine.trim() === '';
    if (blank) {
      prevBlank = true;
      return; // a blank line neither opens nor closes a list
    }

    const indent = indentWidth(rawLine);
    const listItem = isListItem(rawLine);

    // An indented code block needs four columns AND a preceding blank line — it
    // cannot interrupt a paragraph. Once open it runs until a line dedents.
    //
    // The list check is what keeps this from eating real links. Inside a list,
    // four columns is ordinary continuation content — a nested item, or a second
    // paragraph of the parent item — and treating it as code silently drops
    // every link in it. That failure is worse than the one being fixed: #20
    // reported links that were not broken, this would hide links that are.
    if (indent >= 4 && !listItem && !inList && (prevBlank || inIndentedCode)) {
      inIndentedCode = true;
      prevBlank = false;
      return;
    }

    if (indent < 4) {
      inIndentedCode = false;
      // A flush-left line that is not a list item ends the list block.
      inList = listItem;
    } else if (listItem) {
      inList = true;
    }
    prevBlank = false;

    // Blank out inline code spans (`...`, ``...``), preserving offsets.
    const line = rawLine.replace(/(`+)(?:(?!\1)[\s\S])*?\1/g, (m) => ' '.repeat(m.length));

    linkRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(line)) !== null) {
      const [fullMatch, text, url, title] = match;
      const urlStr = url ?? '';
      const isInternal = !urlStr.startsWith('http://') &&
                        !urlStr.startsWith('https://') &&
                        !urlStr.startsWith('mailto:') &&
                        !urlStr.startsWith('#');

      const link: MarkdownLink = {
        text: text ?? '',
        url: urlStr,
        isInternal,
        lineNumber: lineIndex + 1,
        startIndex: match.index,
        endIndex: match.index + (fullMatch?.length ?? 0),
      };
      if (title) {
        link.title = title;
      }
      links.push(link);
    }
    linkRegex.lastIndex = 0;
  });

  return links;
}

/**
 * Extract only internal links
 */
export function extractInternalLinks(content: string): MarkdownLink[] {
  return extractLinks(content).filter((link) => link.isInternal);
}

/**
 * Extract all headings from markdown content
 */
export function extractHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = content.split('\n');

  // Match ATX headings: # Heading
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  lines.forEach((line, lineIndex) => {
    const match = line.match(headingRegex);
    if (match) {
      headings.push({
        level: match[1]?.length ?? 1,
        text: (match[2] ?? '').trim(),
        lineNumber: lineIndex + 1,
      });
    }
  });

  return headings;
}

/**
 * Get the title (first h1) from markdown content
 */
export function extractTitle(content: string): string | null {
  const headings = extractHeadings(content);
  const h1 = headings.find((h) => h.level === 1);
  return h1?.text ?? null;
}

/**
 * Count words in markdown content (excluding code blocks and frontmatter)
 */
export function countWords(content: string): number {
  // Remove frontmatter
  let text = content.replace(/^---[\s\S]*?---\n*/m, '');

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]+`/g, '');

  // Remove markdown syntax
  text = text.replace(/[#*_~[\]()]/g, ' ');

  // Count words
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

/**
 * Calculate estimated read time in minutes
 */
export function calculateReadTime(content: string, wordsPerMinute: number = 200): number {
  const wordCount = countWords(content);
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Format read time as string
 */
export function formatReadTime(content: string): string {
  const minutes = calculateReadTime(content);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Generate a markdown link
 */
export function createLink(text: string, url: string, title?: string): string {
  if (title) {
    return `[${text}](${url} "${title}")`;
  }
  return `[${text}](${url})`;
}

/**
 * Generate a markdown heading
 */
export function createHeading(text: string, level: number = 1): string {
  const hashes = '#'.repeat(Math.min(Math.max(level, 1), 6));
  return `${hashes} ${text}`;
}

/**
 * Generate a markdown table
 */
export function createTable(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map((row) => `| ${row.join(' | ')} |`);

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Generate a markdown list
 */
export function createList(items: string[], ordered: boolean = false): string {
  return items
    .map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`))
    .join('\n');
}

/**
 * Generate a markdown checkbox list
 */
export function createCheckboxList(
  items: { text: string; checked: boolean }[]
): string {
  return items
    .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`)
    .join('\n');
}

/**
 * Wrap text in a code block
 */
export function createCodeBlock(code: string, language: string = ''): string {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Create an inline code span
 */
export function createInlineCode(code: string): string {
  return `\`${code}\``;
}

/**
 * Create a blockquote
 */
export function createBlockquote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * Slugify text for use in URLs/anchors
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Extract first paragraph as excerpt
 */
export function extractExcerpt(content: string, maxLength: number = 200): string {
  // Remove frontmatter
  let text = content.replace(/^---[\s\S]*?---\n*/m, '');

  // Remove headings
  text = text.replace(/^#+\s+.*$/gm, '');

  // Get first paragraph
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const firstParagraph = paragraphs[0] ?? '';

  // Truncate if needed
  if (firstParagraph.length <= maxLength) {
    return firstParagraph.trim();
  }

  return firstParagraph.slice(0, maxLength).trim() + '...';
}
