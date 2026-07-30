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

interface FenceState {
  marker: '`' | '~';
  length: number;
}

function blankCodeSpans(line: string): string {
  return line.replace(/(`+)(.+?)\1/g, (match) => ' '.repeat(match.length));
}

function getFenceMarker(line: string): FenceState | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if (!match?.[1]) {
    return null;
  }

  const marker = match[1][0];
  if (marker !== '`' && marker !== '~') {
    return null;
  }

  return { marker, length: match[1].length };
}

function closesFence(line: string, fence: FenceState): boolean {
  const pattern = new RegExp(`^\\s{0,3}\\${fence.marker}{${fence.length},}\\s*$`);
  return pattern.test(line);
}

/**
 * Extract all links from markdown content
 */
export function extractLinks(content: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  const lines = content.split('\n');
  let fence: FenceState | null = null;

  // Match markdown links: [text](url) or [text](url "title")
  const linkRegex = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

  lines.forEach((line, lineIndex) => {
    if (fence) {
      if (closesFence(line, fence)) {
        fence = null;
      }
      return;
    }

    const openingFence = getFenceMarker(line);
    if (openingFence) {
      fence = openingFence;
      return;
    }

    if (line.startsWith('    ') || line.startsWith('\t')) {
      return;
    }

    const searchableLine = blankCodeSpans(line);
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(searchableLine)) !== null) {
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
    // Reset regex lastIndex for next line
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
  text = text.replace(/[#*_~\[\]()]/g, ' ');

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
