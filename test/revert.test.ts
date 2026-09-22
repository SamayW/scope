import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyze } from '../src/core/analyze.js';
import { revertHunk, revertFile, revertOutOfScope } from '../src/core/revert.js';
import type { Session } from '../src/core/types.js';
import { DEMO_REPO as DEMO, hasDemoRepo } from './demo-repo.js';

let clone: string;
let baseSha: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: clone, encoding: 'utf8' });

function writeSession(allow: Session['allow']): void {
  mkdirSync(join(clone, '.scope'), { recursive: true });
  writeFileSync(
    join(clone, '.scope', 'session.json'),
    JSON.stringify({
      task: 'add signup form validation',
      baseline: baseSha,
      allow,
      approved: [],
      createdAt: '2026-09-22T09:00:00.000Z',
    } satisfies Session)
  );
}

beforeEach(() => {
  clone = mkdtempSync(join(tmpdir(), 'scope-revert-'));
  execFileSync('git', ['clone', '-q', DEMO, clone]);
  // the fixed demo lineage, built locally
  git('checkout', '-q', '-b', 'demo-agent', 'origin/demo-agent');
  baseSha = git('rev-parse', 'origin/demo-base').trim();
  writeSession({ globs: ['src/app/signup/*.tsx'], domains: [] });
});

afterEach(() => {
  rmSync(clone, { recursive: true, force: true });
});

describe.skipIf(!hasDemoRepo)('revertHunk', () => {
  it('undoes a single hunk', async () => {
    const analysis = await analyze(clone);
    const middleware = analysis.groups
      .flatMap((g) => g.hunks)
      .find((h) => h.file === 'src/middleware.ts')!;

    expect(readFileSync(join(clone, 'src/middleware.ts'), 'utf8')).toContain(
      'return NextResponse.next();\n  const session'
    );

    await revertHunk(clone, middleware);

    expect(readFileSync(join(clone, 'src/middleware.ts'), 'utf8')).not.toContain(
      'return NextResponse.next();\n  const session'
    );
  });

  it('restores a deleted file', async () => {
    expect(existsSync(join(clone, 'src/app/signup/signup.test.ts'))).toBe(false);

    const analysis = await analyze(clone);
    const deleted = analysis.groups
      .flatMap((g) => g.hunks)
      .find((h) => h.file === 'src/app/signup/signup.test.ts')!;
    await revertHunk(clone, deleted);

    expect(existsSync(join(clone, 'src/app/signup/signup.test.ts'))).toBe(true);
  });

  it('throws rather than failing silently when the patch will not apply', async () => {
    const analysis = await analyze(clone);
    const hunk = analysis.groups.flatMap((g) => g.hunks)[0];

    await revertHunk(clone, hunk);
    // applying the same reversal twice cannot work
    await expect(revertHunk(clone, hunk)).rejects.toThrow(/git apply -R failed/);
  });
});

describe.skipIf(!hasDemoRepo)('revertFile', () => {
  it('checks a modified file back out of the baseline', async () => {
    await revertFile(clone, 'prisma/schema.prisma', baseSha, 'modified');
    expect(readFileSync(join(clone, 'prisma/schema.prisma'), 'utf8')).not.toContain('isAdmin');
  });

  it('deletes a file that did not exist at the baseline', async () => {
    writeFileSync(join(clone, 'brand-new.ts'), 'export const x = 1;\n');
    await revertFile(clone, 'brand-new.ts', baseSha, 'added');
    expect(existsSync(join(clone, 'brand-new.ts'))).toBe(false);
  });

  it('throws on an unknown baseline', async () => {
    await expect(revertFile(clone, 'prisma/schema.prisma', 'nope', 'modified')).rejects.toThrow();
  });
});

describe.skipIf(!hasDemoRepo)('revertOutOfScope', () => {
  it('leaves only the signup validation behind', async () => {
    const analysis = await analyze(clone);
    const { reverted, failed } = await revertOutOfScope(clone, analysis);

    expect(failed).toEqual([]);
    expect(reverted.length).toBeGreaterThan(0);

    const changed = execFileSync('git', ['diff', '--name-only', baseSha], {
      cwd: clone,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);

    expect(changed).toEqual(['src/app/signup/page.tsx']);
  });

  it('removes the planted key along with the auth bypass', async () => {
    const analysis = await analyze(clone);
    await revertOutOfScope(clone, analysis);

    const middleware = readFileSync(join(clone, 'src/middleware.ts'), 'utf8');
    expect(middleware).not.toContain('sk-test-');
    expect(middleware).not.toContain('eslint-disable');
  });

  it('restores the deleted test', async () => {
    const analysis = await analyze(clone);
    await revertOutOfScope(clone, analysis);
    expect(existsSync(join(clone, 'src/app/signup/signup.test.ts'))).toBe(true);
  });

  it('leaves approved hunks alone', async () => {
    const analysis = await analyze(clone);
    const authHunk = analysis.groups
      .flatMap((g) => g.hunks)
      .find((h) => h.file === 'src/middleware.ts')!;

    writeSession({ globs: ['src/app/signup/*.tsx'], domains: [] });
    const approved = await analyze(clone);
    const withApproval = {
      ...approved,
      groups: approved.groups.map((g) => ({
        ...g,
        hunks: g.hunks.map((h) => (h.id === authHunk.id ? { ...h, approved: true } : h)),
      })),
    };

    const { reverted } = await revertOutOfScope(clone, withApproval);
    expect(reverted).not.toContain(authHunk.id);
    expect(readFileSync(join(clone, 'src/middleware.ts'), 'utf8')).toContain('sk-test-');
  });

  it('does nothing when there is no session, since nothing is out of scope', async () => {
    rmSync(join(clone, '.scope'), { recursive: true, force: true });
    const analysis = await analyze(clone);
    expect(await revertOutOfScope(clone, analysis)).toEqual({ reverted: [], failed: [] });
  });

  it('reverts every file when nothing is in scope', async () => {
    writeSession({ globs: [], domains: [] });
    const analysis = await analyze(clone);

    const { failed } = await revertOutOfScope(clone, analysis);
    expect(failed).toEqual([]);

    const changed = execFileSync('git', ['diff', '--name-only', baseSha], {
      cwd: clone,
      encoding: 'utf8',
    }).trim();
    expect(changed).toBe('');
  });
});

describe.skipIf(!hasDemoRepo)('bottom-up ordering within a file', () => {
  let repo: string;
  let base: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'scope-multihunk-'));
    const run = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
    run('init', '-q', '-b', 'main');
    run('config', 'user.email', 't@e.com');
    run('config', 'user.name', 'T');

    const lines = Array.from({ length: 40 }, (_, i) => `const line${i + 1} = ${i + 1};`);
    writeFileSync(join(repo, 'big.ts'), `${lines.join('\n')}\n`);
    run('add', '-A');
    run('commit', '-q', '-m', 'base');
    base = run('rev-parse', 'HEAD').trim();

    // two edits far enough apart to produce separate hunks
    lines[2] = 'const line3 = 999;';
    lines[34] = 'const line35 = 888;';
    writeFileSync(join(repo, 'big.ts'), `${lines.join('\n')}\n`);

    mkdirSync(join(repo, '.scope'), { recursive: true });
    writeFileSync(
      join(repo, '.scope', 'session.json'),
      JSON.stringify({
        task: 'unrelated task',
        baseline: base,
        allow: { globs: [], domains: [] },
        approved: [],
        createdAt: '2026-09-22T09:00:00.000Z',
      } satisfies Session)
    );
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('reverts both hunks of one file cleanly', async () => {
    const analysis = await analyze(repo);
    const hunks = analysis.groups.flatMap((g) => g.hunks).filter((h) => h.file === 'big.ts');

    // the whole point of the ordering logic: more than one hunk in one file
    expect(hunks.length).toBe(2);

    const { reverted, failed } = await revertOutOfScope(repo, analysis);
    expect(failed).toEqual([]);
    expect(reverted.length).toBe(2);

    const changed = execFileSync('git', ['diff', '--name-only', base], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(changed).toBe('');
  });

  it('reverting top-down instead would corrupt the second patch', async () => {
    // Guards the ordering: applying the lower hunk first shifts the offsets the
    // higher one was built against.
    const analysis = await analyze(repo);
    const hunks = analysis.groups
      .flatMap((g) => g.hunks)
      .filter((h) => h.file === 'big.ts')
      .sort((a, b) => a.id.localeCompare(b.id));

    await revertHunk(repo, hunks[0]);
    await expect(revertHunk(repo, hunks[1])).resolves.not.toThrow();
  });
});
