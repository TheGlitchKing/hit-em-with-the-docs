/**
 * Stale-fact detection + verify-command execution (2.3.0 PR3).
 *
 * `auditFacts()` is the writer side of `hewtd audit-facts` — pure-data,
 * easy to unit-test with date injection. `runFactVerify()` actually
 * shells out and updates `last_verified` on success.
 *
 * Working-dir resolution (locked in during planning):
 *   - Default: `<vault-root>/facts/`
 *   - Override: a fact's optional `working_dir:` frontmatter field
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';
import matter from 'gray-matter';
import type { FactRef, CiterIndex } from './citers.js';

export interface StaleFact {
  id: string;
  path: string;
  relPath: string;
  title: string;
  confidence: string | undefined;
  lastVerified: string;
  daysSinceVerified: number;
}

export interface AuditFactsOptions {
  index: CiterIndex;
  /** Reference date for "now". Defaults to today. Tests inject a fixed date. */
  now?: Date;
  /** Stale threshold in days. Defaults to 90. */
  auditWindowDays?: number;
}

export interface AuditFactsResult {
  stale: StaleFact[];
  /** Facts whose last_verified is malformed or absent. Reported but not "stale". */
  unverifiable: FactRef[];
}

export function auditFacts(options: AuditFactsOptions): AuditFactsResult {
  const { index, now = new Date(), auditWindowDays = 90 } = options;
  const cutoffMs = now.getTime() - auditWindowDays * 24 * 60 * 60 * 1000;

  const stale: StaleFact[] = [];
  const unverifiable: FactRef[] = [];

  for (const fact of index.facts.values()) {
    if (!fact.lastVerified) {
      unverifiable.push(fact);
      continue;
    }
    const verifiedMs = new Date(`${fact.lastVerified}T00:00:00Z`).getTime();
    if (Number.isNaN(verifiedMs)) {
      unverifiable.push(fact);
      continue;
    }
    if (verifiedMs < cutoffMs) {
      const daysSinceVerified = Math.floor(
        (now.getTime() - verifiedMs) / (24 * 60 * 60 * 1000)
      );
      stale.push({
        id: fact.id,
        path: fact.path,
        relPath: fact.relPath,
        title: fact.title,
        confidence: fact.confidence,
        lastVerified: fact.lastVerified,
        daysSinceVerified,
      });
    }
  }

  // Deterministic order: by daysSinceVerified desc (oldest first), id asc.
  stale.sort((a, b) => {
    if (a.daysSinceVerified !== b.daysSinceVerified) {
      return b.daysSinceVerified - a.daysSinceVerified;
    }
    return a.id.localeCompare(b.id);
  });
  unverifiable.sort((a, b) => a.id.localeCompare(b.id));

  return { stale, unverifiable };
}

export interface RunVerifyOptions {
  fact: FactRef;
  /** Absolute vault root (used to compute default CWD). */
  vaultRoot: string;
  /** Override CWD (test seam). */
  cwdOverride?: string;
  /** Inject a fake date for the `last_verified` rewrite. */
  now?: Date;
  /** Skip the actual shell-out (test seam). Returns success without running. */
  skipExec?: boolean;
}

export interface RunVerifyResult {
  factId: string;
  executed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** True iff the fact's `last_verified` was updated. */
  updated: boolean;
  /** YYYY-MM-DD that was written. */
  newLastVerified: string | undefined;
}

/**
 * Execute a fact's `verify_command` and update `last_verified` on success.
 * Returns a typed result describing what happened.
 *
 * The verify command runs in a child shell (bash via `-c`). CWD resolution:
 *   1. `cwdOverride` (test seam)
 *   2. Fact's frontmatter `working_dir:` field, resolved relative to vaultRoot
 *   3. `<vaultRoot>/facts/` default
 */
export async function runFactVerify(
  options: RunVerifyOptions
): Promise<RunVerifyResult> {
  const { fact, vaultRoot, cwdOverride, now = new Date(), skipExec = false } = options;

  // Read the fact file fresh — we need the full frontmatter (verify_command,
  // working_dir) which isn't in the lightweight CiterIndex FactRef.
  const factContent = await readFile(fact.path, 'utf-8');
  const parsed = matter(factContent);
  const verifyCommand = parsed.data.verify_command;
  const workingDir = parsed.data.working_dir;

  if (typeof verifyCommand !== 'string' || verifyCommand.trim().length === 0) {
    return {
      factId: fact.id,
      executed: false,
      exitCode: null,
      stdout: '',
      stderr: 'no verify_command defined',
      updated: false,
      newLastVerified: undefined,
    };
  }

  const cwd =
    cwdOverride ??
    (typeof workingDir === 'string'
      ? resolve(vaultRoot, workingDir)
      : resolve(vaultRoot, 'facts'));

  if (skipExec) {
    return finalize({
      success: true,
      exitCode: 0,
      stdout: '[skipExec=true]',
      stderr: '',
    });
  }

  const result = await execShell(verifyCommand, cwd);
  return finalize(result);

  async function finalize(r: {
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
  }): Promise<RunVerifyResult> {
    if (!r.success) {
      return {
        factId: fact.id,
        executed: true,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        updated: false,
        newLastVerified: undefined,
      };
    }
    const newDate = now.toISOString().slice(0, 10);
    parsed.data.last_verified = newDate;
    const rewritten = matter.stringify(parsed.content, parsed.data);
    await writeFile(fact.path, rewritten, 'utf-8');
    return {
      factId: fact.id,
      executed: true,
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      updated: true,
      newLastVerified: newDate,
    };
  }
}

interface ShellResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

function execShell(command: string, cwd: string): Promise<ShellResult> {
  return new Promise((resolvePromise) => {
    if (!existsSync(cwd)) {
      resolvePromise({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: `working dir does not exist: ${cwd}`,
      });
      return;
    }

    const child = spawn('bash', ['-c', command], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('close', (code) => {
      resolvePromise({
        success: code === 0,
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });
    child.on('error', (err) => {
      resolvePromise({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}
