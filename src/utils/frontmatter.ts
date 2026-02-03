import matter from 'gray-matter';
import yaml from 'yaml';

export interface FrontmatterResult<T = Record<string, unknown>> {
  data: T;
  content: string;
  isEmpty: boolean;
  excerpt?: string;
}

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): FrontmatterResult<T> {
  const result = matter(content);
  const parsed: FrontmatterResult<T> = {
    data: result.data as T,
    content: result.content,
    isEmpty: Object.keys(result.data).length === 0,
  };
  if (result.excerpt) {
    parsed.excerpt = result.excerpt;
  }
  return parsed;
}

/**
 * Check if content has frontmatter
 */
export function hasFrontmatter(content: string): boolean {
  return content.trimStart().startsWith('---');
}

/**
 * Extract frontmatter string from content
 */
export function extractFrontmatterString(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] ?? null : null;
}

/**
 * Stringify frontmatter data to YAML
 */
export function stringifyFrontmatter(data: Record<string, unknown>): string {
  // Use yaml library for better formatting control
  return yaml.stringify(data, {
    indent: 2,
    lineWidth: 80,
    singleQuote: true,
  });
}

/**
 * Add or update frontmatter in content
 */
export function setFrontmatter(
  content: string,
  data: Record<string, unknown>
): string {
  const { content: body } = parseFrontmatter(content);
  const frontmatter = stringifyFrontmatter(data);
  return `---\n${frontmatter}---\n\n${body.trimStart()}`;
}

/**
 * Merge frontmatter data with existing
 */
export function mergeFrontmatter(
  content: string,
  newData: Record<string, unknown>
): string {
  const { data: existingData, content: body } = parseFrontmatter(content);
  const mergedData = { ...existingData, ...newData };
  const frontmatter = stringifyFrontmatter(mergedData);
  return `---\n${frontmatter}---\n\n${body.trimStart()}`;
}

/**
 * Remove frontmatter from content
 */
export function removeFrontmatter(content: string): string {
  const { content: body } = parseFrontmatter(content);
  return body.trimStart();
}

/**
 * Get specific frontmatter field
 */
export function getFrontmatterField<T>(
  content: string,
  field: string
): T | undefined {
  const { data } = parseFrontmatter(content);
  return data[field] as T | undefined;
}

/**
 * Set specific frontmatter field
 */
export function setFrontmatterField(
  content: string,
  field: string,
  value: unknown
): string {
  const { data, content: body } = parseFrontmatter(content);
  data[field] = value;
  const frontmatter = stringifyFrontmatter(data);
  return `---\n${frontmatter}---\n\n${body.trimStart()}`;
}

/**
 * Validate frontmatter structure
 */
export function validateFrontmatter(
  content: string,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  const { data } = parseFrontmatter(content);
  const missingFields = requiredFields.filter(
    (field) => !(field in data) || data[field] === undefined || data[field] === null
  );
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}
