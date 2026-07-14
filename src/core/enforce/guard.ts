/**
 * Lifecycle enforcement — the decision function behind the PreToolUse hook.
 *
 * hewtd's lifecycle policy has always been enforced at the CLI boundary (the
 * archive link guard, `auto: false`, the frontmatter schema). None of that
 * binds an *agent*, which will happily `rm` a doc, hand-edit a generated
 * INDEX.md, or invent its own `docs/` folder. This is the part the model
 * cannot reason its way past: the harness runs it, and a `deny` is final.
 *
 * Two rules deny, because they destroy work or corrupt a generated artifact.
 * Everything else at most warns. Anything unrecognized is allowed — this runs
 * in every session the plugin is installed in, including repos that have
 * nothing to do with hewtd, so the cost of a false positive is far higher
 * than the cost of a miss.
 */

import { basename } from 'path';

/** Files hewtd generates and owns. Hand-editing them is always wrong. */
const GENERATED_FILES = new Set(['INDEX.md', 'REGISTRY.md']);

export type GuardDecision =
  | { action: 'allow' }
  | { action: 'warn'; context: string }
  | { action: 'deny'; reason: string };

export interface GuardInput {
  toolName: string;
  /** `file_path` for Write/Edit. */
  filePath?: string;
  /** `command` for Bash. */
  command?: string;
  /** `content` (Write) or `new_string` (Edit) — used to spot lifecycle changes. */
  text?: string;
  /** Docs root relative to the project, e.g. `.documentation`. */
  docsDir: string;
}

/** Which enforcement rules are active. Both default on; users can opt out. */
export interface EnforcementPolicy {
  blockIndexEdits: boolean;
  blockDocDeletion: boolean;
}

export const DEFAULT_ENFORCEMENT: EnforcementPolicy = {
  blockIndexEdits: true,
  blockDocDeletion: true,
};

/** Posix-normalized, leading-`./`-stripped path for matching. */
function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Is this path inside the documentation tree? */
function inDocsTree(path: string, docsDir: string): boolean {
  const p = normalize(path);
  const d = normalize(docsDir);
  return p === d || p.includes(`/${d}/`) || p.startsWith(`${d}/`);
}

/**
 * Shell commands that destroy a file. `mv` is deliberately absent: moving a
 * doc is how `archive` itself works (via `git mv`), and a hand-rolled move is
 * a warn, not a denial — it loses the frontmatter stamping, but loses nothing.
 */
const DESTRUCTIVE_RE = /(^|[\s;&|(])(rm|unlink|shred)\s|(^|[\s;&|(])git\s+rm\s/;

/** Markdown paths a shell command names. */
function markdownTargets(command: string, docsDir: string): string[] {
  const d = normalize(docsDir);
  const re = new RegExp(`[^\\s'"\`;&|]*${d}/[^\\s'"\`;&|]*\\.md`, 'g');
  return command.match(re) ?? [];
}

/** Does this text set `status: deprecated` in frontmatter? */
function setsDeprecated(text: string): boolean {
  return /^\s*status:\s*['"]?deprecated['"]?\s*$/m.test(text);
}

/**
 * Decide what to do about one tool call. Pure — all I/O lives in the hook.
 */
export function evaluate(
  input: GuardInput,
  policy: EnforcementPolicy = DEFAULT_ENFORCEMENT
): GuardDecision {
  const { toolName, filePath, command, text, docsDir } = input;

  // ---- Write / Edit -------------------------------------------------------
  if ((toolName === 'Write' || toolName === 'Edit') && filePath) {
    const inTree = inDocsTree(filePath, docsDir);

    // DENY: a generated index is not a document. Editing it by hand is either
    // pointless (the next `hewtd index` overwrites it) or actively harmful
    // (it is how people ended up hand-curating rows the indexer then deleted
    // — see issue #12).
    if (policy.blockIndexEdits && inTree && GENERATED_FILES.has(basename(filePath))) {
      return {
        action: 'deny',
        reason:
          `${basename(filePath)} is a generated artifact, rebuilt from the documents ` +
          `on disk. Hand-edits are overwritten by the next \`hewtd index\` or ` +
          `\`hewtd maintain\`. To change what it lists, change the documents — then ` +
          `run \`hewtd index\`.`,
      };
    }

    // WARN: a doc outside the tree is invisible to every hewtd scan. Scoped to
    // markdown that is plausibly *documentation* — a rival `docs/` folder, or a
    // loose doc at the repo root. Warning on every .md anywhere (a fixture, a
    // subpackage README, a website's own docs) would be noise, and a noisy
    // guard is one people switch off.
    if (!inTree && looksLikeStrayDoc(filePath)) {
      return {
        action: 'warn',
        context:
          `This project manages its documentation with hit-em-with-the-docs, under ` +
          `\`${docsDir}/\`. A markdown file outside that tree is not indexed, ` +
          `link-checked, or metadata-validated. \`hewtd integrate <file>\` classifies ` +
          `a doc into a domain and registers it.`,
      };
    }

    // WARN: `status: deprecated` flags intent but leaves the doc live and
    // indexed. Archiving is the separate step that actually retires it.
    if (inTree && text && setsDeprecated(text)) {
      return {
        action: 'warn',
        context:
          `\`status: deprecated\` marks intent but leaves the document in its domain ` +
          `folder, still indexed and still scanned. \`hewtd archive <file>\` retires ` +
          `it: the move is reversible (\`archived_from\` records the origin) and ` +
          `link-safe (it refuses if active docs still link to it).`,
      };
    }

    return { action: 'allow' };
  }

  // ---- Bash ---------------------------------------------------------------
  if (toolName === 'Bash' && command) {
    const targets = markdownTargets(command, docsDir);
    if (targets.length === 0) return { action: 'allow' };

    // DENY: deleting a doc is the one truly irreversible act, and hewtd has a
    // purpose-built, reversible, link-safe alternative. This is the whole
    // reason the plugin never calls rm/unlink anywhere in its own source.
    if (policy.blockDocDeletion && DESTRUCTIVE_RE.test(command)) {
      return {
        action: 'deny',
        reason:
          `Deleting documentation is destructive and hewtd never does it. ` +
          `\`hewtd archive ${targets[0]}\` retires a doc instead: it moves the file ` +
          `under \`archive/\` (preserving git history), stamps \`archived_from\` so ` +
          `\`hewtd unarchive\` can restore it exactly, and refuses if active docs ` +
          `still link to it. Use \`--force\` there to override the link guard.`,
      };
    }

    // WARN: a hand-rolled move into archive/ skips the frontmatter stamping,
    // so `unarchive` has no `archived_from` to restore from.
    if (/(^|[\s;&|(])(mv|git\s+mv)\s/.test(command) && /archive\//.test(command)) {
      return {
        action: 'warn',
        context:
          `Moving a doc into \`archive/\` by hand skips the lifecycle stamping. ` +
          `\`hewtd archive <file>\` records \`archived_on\`, \`archived_from\`, and ` +
          `\`archived_reason\`, which is what makes \`hewtd unarchive\` lossless; a ` +
          `plain move leaves nothing to restore from.`,
      };
    }

    return { action: 'allow' };
  }

  return { action: 'allow' };
}

/** A repo's own top-level markdown — never documentation-tree content. */
const PROJECT_FILES = new Set([
  'README.MD',
  'CHANGELOG.MD',
  'CONTRIBUTING.MD',
  'LICENSE.MD',
  'CLAUDE.MD',
  'AGENTS.MD',
  'SECURITY.MD',
  'CODE_OF_CONDUCT.MD',
]);

/** Folder names that mean "somebody is starting a rival documentation tree". */
const RIVAL_DOC_DIRS = new Set(['docs', 'doc', 'documentation', 'wiki', 'guides']);

/**
 * Is this markdown a *stray document* — something that ought to have gone
 * through `integrate`?
 *
 * Deliberately narrow. It catches the real failure mode (an agent creating
 * `docs/how-it-works.md` in a repo that already has a managed tree, or dropping
 * a loose doc at the root) and stays silent on markdown that is obviously not
 * documentation: source fixtures, subpackage READMEs, a website's own content,
 * agent scaffolding. Anything it misses is merely un-nagged; anything it
 * over-claims is a papercut on every unrelated file the user writes.
 */
function looksLikeStrayDoc(filePath: string): boolean {
  const p = normalize(filePath);
  if (!p.endsWith('.md')) return false;

  const segments = p.split('/');
  const name = basename(p).toUpperCase();

  // Agent/tooling scaffolding and dependencies are never docs.
  if (segments.some((s) => s === 'node_modules' || s === '.planning' || s === '.claude')) {
    return false;
  }

  // A rival docs folder anywhere in the path.
  if (segments.slice(0, -1).some((s) => RIVAL_DOC_DIRS.has(s.toLowerCase()))) {
    return true;
  }

  // A loose doc sitting at the repo root that isn't one of the standard
  // project files.
  if (segments.length === 1 && !PROJECT_FILES.has(name)) return true;

  return false;
}
