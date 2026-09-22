import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getHeadSha, getRepoRoot, getRawDiff } from '../src/core/git.js';

let repo: string;
let baseline: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeAll(async () => {
  repo = mkdtempSync(join(tmpdir(), 'scope-git-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');

  writeFileSync(join(repo, 'tracked.ts'), 'export const a = 1;\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  baseline = await getHeadSha(repo);

  // one tracked modification and one untracked file
  writeFileSync(join(repo, 'tracked.ts'), 'export const a = 2;\n');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src', 'brand-new.ts'), 'export const b = 3;\n');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('git', () => {
  it('getHeadSha returns a 40 character sha', () => {
    expect(baseline).toMatch(/^[0-9a-f]{40}$/);
  });

  it('getRepoRoot resolves from a subfolder', async () => {
    const fromSub = await getRepoRoot(join(repo, 'src'));
    // macOS tmpdir is a symlink to /private/var, so compare the basename
    expect(fromSub.endsWith(repo.split('/').pop()!)).toBe(true);
  });

  it('includes tracked modifications', async () => {
    const raw = await getRawDiff(repo, baseline);
    expect(raw).toContain('diff --git a/tracked.ts b/tracked.ts');
    expect(raw).toContain('-export const a = 1;');
    expect(raw).toContain('+export const a = 2;');
  });

  it('includes untracked files, which plain git diff would miss', async () => {
    const raw = await getRawDiff(repo, baseline);
    expect(raw).toContain('src/brand-new.ts');
    expect(raw).toContain('+export const b = 3;');
  });

  it('respects gitignore for untracked files', async () => {
    writeFileSync(join(repo, '.gitignore'), 'ignored.ts\n');
    writeFileSync(join(repo, 'ignored.ts'), 'export const c = 4;\n');
    const raw = await getRawDiff(repo, baseline);
    expect(raw).not.toContain('export const c = 4;');
  });

  it('returns an empty string when nothing changed', async () => {
    const clean = mkdtempSync(join(tmpdir(), 'scope-clean-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: clean });
    execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: clean });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: clean });
    writeFileSync(join(clean, 'x.ts'), 'export const x = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: clean });
    execFileSync('git', ['commit', '-q', '-m', 'only'], { cwd: clean });
    const sha = await getHeadSha(clean);
    expect(await getRawDiff(clean, sha)).toBe('');
    rmSync(clean, { recursive: true, force: true });
  });
});
