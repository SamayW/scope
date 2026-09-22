import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { analyze } from '../src/core/analyze.js';
import type { Analysis, Session } from '../src/core/types.js';

const DEMO = resolve(__dirname, '../../scope-demo');

let clone: string;
let baseSha: string;

function writeSession(allow: Session['allow']): void {
  mkdirSync(join(clone, '.scope'), { recursive: true });
  const session: Session = {
    task: 'add signup form validation',
    baseline: baseSha,
    allow,
    approved: [],
    createdAt: '2026-09-22T09:00:00.000Z',
  };
  writeFileSync(join(clone, '.scope', 'session.json'), JSON.stringify(session, null, 2));
}

beforeAll(() => {
  // Clone so the real demo repo is never touched.
  clone = mkdtempSync(join(tmpdir(), 'scope-analyze-'));
  execFileSync('git', ['clone', '-q', DEMO, clone]);
  execFileSync('git', ['checkout', '-q', 'agent'], { cwd: clone });
  baseSha = execFileSync('git', ['rev-parse', 'base'], { cwd: clone, encoding: 'utf8' }).trim();
});

afterAll(() => {
  rmSync(clone, { recursive: true, force: true });
});

describe('analyze on the demo repo, scoped to the signup UI', () => {
  let analysis: Analysis;

  beforeAll(async () => {
    writeSession({ globs: ['src/app/signup/*.tsx'], domains: [] });
    analysis = await analyze(clone);
  });

  it('finds the four changed files', () => {
    expect([...analysis.changedFiles].sort()).toEqual([
      'prisma/schema.prisma',
      'src/app/signup/page.tsx',
      'src/app/signup/signup.test.ts',
      'src/middleware.ts',
    ]);
  });

  it('never analyzes its own session state', () => {
    // .scope/session.json contains "session" in the path, which the auth rule
    // would otherwise match.
    expect(analysis.changedFiles.some((f) => f.startsWith('.scope/'))).toBe(false);
    expect(analysis.groups.flatMap((g) => g.hunks).some((h) => h.file.startsWith('.scope/'))).toBe(
      false
    );
  });

  it('produces the four expected domains', () => {
    expect([...analysis.groups.map((g) => g.domain)].sort()).toEqual(['auth', 'db', 'tests', 'ui']);
  });

  it('flags auth, db and tests as high risk and out of scope', () => {
    for (const domain of ['auth', 'db', 'tests']) {
      const group = analysis.groups.find((g) => g.domain === domain)!;
      expect(group.risk, `${domain} risk`).toBe('high');
      expect(group.outOfScope, `${domain} outOfScope`).toBe(true);
    }
  });

  it('keeps the signup UI in scope', () => {
    const ui = analysis.groups.find((g) => g.domain === 'ui')!;
    expect(ui.outOfScope).toBe(false);
  });

  it('still rates the UI high because of the planted key', () => {
    // In scope does not mean safe. A hardcoded secret is high risk either way.
    const ui = analysis.groups.find((g) => g.domain === 'ui')!;
    const flags = ui.hunks.flatMap((h) => h.flags).map((f) => f.id);
    expect(flags).toContain('secret');
    expect(flags).toContain('lint-suppression');
    expect(ui.risk).toBe('high');
  });

  it('catches the deleted test and its removed assertion', () => {
    const tests = analysis.groups.find((g) => g.domain === 'tests')!;
    const flags = tests.hunks.flatMap((h) => h.flags).map((f) => f.id);
    expect(flags).toContain('deleted-test');
    expect(flags).toContain('removed-assertion');
  });

  it('sorts the worst group first', () => {
    expect(analysis.groups[0].domain).toBe('tests');
    const scores = analysis.groups.map((g) => g.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('scope boundaries change what counts as out of scope', () => {
  it('a broader glob pulls the deleted test back in scope', async () => {
    // Worth knowing for the demo: "src/app/signup/**" also covers
    // signup.test.ts, so the deleted test stops being an out-of-scope finding
    // and "revert all out-of-scope" would no longer restore it. The gate still
    // blocks it, but on the deleted_tests rule rather than out_of_scope.
    writeSession({ globs: ['src/app/signup/**'], domains: [] });
    const analysis = await analyze(clone);
    const tests = analysis.groups.find((g) => g.domain === 'tests')!;

    expect(tests.outOfScope).toBe(false);
    expect(tests.risk).toBe('high');
    expect(tests.hunks.flatMap((h) => h.flags).map((f) => f.id)).toContain('deleted-test');
  });

  it('with no session at all, everything is in scope', async () => {
    rmSync(join(clone, '.scope'), { recursive: true, force: true });
    const analysis = await analyze(clone);
    expect(analysis.session).toBeNull();
    expect(analysis.groups.every((g) => !g.outOfScope)).toBe(true);
  });
});
