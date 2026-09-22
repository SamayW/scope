import { rmSync } from 'node:fs';
import { join } from 'node:path';
import execa from 'execa';
import type { Analysis, ClassifiedHunk, Hunk } from './types.js';

/** Hunk ids are `<file>#<index>`. */
function hunkIndex(hunk: Hunk): number {
  const raw = Number.parseInt(hunk.id.slice(hunk.id.lastIndexOf('#') + 1), 10);
  return Number.isNaN(raw) ? 0 : raw;
}

/**
 * Reverses a single hunk by feeding its patch back through git.
 *
 * Two attempts, because the right call depends on whether the agent committed:
 *
 * - `--index` keeps the index in step with the working tree. Without it a
 *   restored file reappears on disk while the index still records the
 *   deletion, so `git diff <baseline>` keeps reporting it as gone and the gate
 *   never clears. This is the committed case, such as a pre-push run.
 * - `--index` refuses outright when the working tree has unstaged edits, which
 *   is the normal case for an agent that has been editing without committing.
 *   There, a working-tree-only revert is both correct and all git will allow.
 */
export async function revertHunk(cwd: string, hunk: Hunk): Promise<void> {
  const withIndex = await execa('git', ['apply', '-R', '--index', '-'], {
    cwd,
    input: hunk.patch,
    reject: false,
  });

  if (withIndex.exitCode === 0) {
    return;
  }

  const worktreeOnly = await execa('git', ['apply', '-R', '-'], {
    cwd,
    input: hunk.patch,
    reject: false,
  });

  if (worktreeOnly.exitCode !== 0) {
    throw new Error(
      `git apply -R failed for ${hunk.id}: ${worktreeOnly.stderr || worktreeOnly.stdout}`
    );
  }
}

/** Restores a whole file. The fallback when a single hunk will not apply. */
export async function revertFile(
  cwd: string,
  file: string,
  baseline: string,
  status: Hunk['fileStatus']
): Promise<void> {
  if (status === 'added') {
    // it did not exist at the baseline, so there is nothing to check out
    rmSync(join(cwd, file), { force: true });
    return;
  }

  const result = await execa('git', ['checkout', baseline, '--', file], { cwd, reject: false });
  if (result.exitCode !== 0) {
    throw new Error(`git checkout failed for ${file}: ${result.stderr || result.stdout}`);
  }
}

/**
 * Reverts every unapproved out-of-scope hunk.
 *
 * Hunks within a file are reverted bottom-up: reversing a hunk shifts the line
 * numbers of everything after it, so working from the highest index down keeps
 * the earlier offsets valid. If any hunk in a file will not apply, the whole
 * file falls back to its baseline copy.
 */
export async function revertOutOfScope(
  cwd: string,
  analysis: Analysis
): Promise<{ reverted: string[]; failed: string[] }> {
  const reverted: string[] = [];
  const failed: string[] = [];

  const targets = analysis.groups
    .flatMap((group) => group.hunks)
    .filter((hunk) => !hunk.inScope && !hunk.approved);

  if (targets.length === 0) {
    return { reverted, failed };
  }

  const byFile = new Map<string, ClassifiedHunk[]>();
  for (const hunk of targets) {
    const existing = byFile.get(hunk.file);
    if (existing) {
      existing.push(hunk);
    } else {
      byFile.set(hunk.file, [hunk]);
    }
  }

  for (const [file, hunks] of byFile) {
    const bottomUp = [...hunks].sort((a, b) => hunkIndex(b) - hunkIndex(a));
    const done: string[] = [];
    let needsFileFallback = false;

    for (const hunk of bottomUp) {
      try {
        await revertHunk(cwd, hunk);
        done.push(hunk.id);
      } catch {
        needsFileFallback = true;
        break;
      }
    }

    if (!needsFileFallback) {
      reverted.push(...done);
      continue;
    }

    const baseline = analysis.session?.baseline;
    try {
      if (!baseline) {
        throw new Error('no baseline to restore from');
      }
      await revertFile(cwd, file, baseline, bottomUp[0].fileStatus);
      // the file is wholly back at baseline, so every hunk in it is undone
      reverted.push(...bottomUp.map((hunk) => hunk.id));
    } catch {
      failed.push(...bottomUp.map((hunk) => hunk.id));
    }
  }

  return { reverted, failed };
}
