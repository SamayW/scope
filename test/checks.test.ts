import { describe, it, expect } from 'vitest';
import { selectChecks } from '../src/core/checks.js';
import { DEFAULT_POLICY } from '../src/core/gate.js';
import type { Analysis, ClassifiedHunk, Domain, FileStatus, Stack } from '../src/core/types.js';

const FULL_STACK: Stack = {
  typescript: true,
  next: true,
  prisma: true,
  eslint: true,
  docker: false,
  testRunner: 'vitest',
  packageManager: 'npm',
};

function analysisOf(files: Array<[string, Domain, FileStatus?]>): Analysis {
  const hunks: ClassifiedHunk[] = files.map(([file, domain, fileStatus]) => ({
    id: `${file}#0`,
    file,
    fileStatus: fileStatus ?? 'modified',
    added: [],
    removed: [],
    patch: '',
    domain,
    flags: [],
    score: 0,
    inScope: true,
    approved: false,
  }));

  const domains = [...new Set(hunks.map((h) => h.domain))];

  return {
    session: null,
    changedFiles: [...new Set(hunks.map((h) => h.file))],
    groups: domains.map((domain) => ({
      domain,
      risk: 'low' as const,
      score: 0,
      outOfScope: false,
      hunks: hunks.filter((h) => h.domain === domain),
      checks: [],
    })),
  };
}

const ids = (stack: Stack, analysis: Analysis, policy = DEFAULT_POLICY) =>
  selectChecks(stack, analysis, policy).map((c) => c.id);

describe('selectChecks runs only what the diff touched', () => {
  it('skips tsc when no TypeScript changed', () => {
    expect(ids(FULL_STACK, analysisOf([['README.md', 'other']]))).not.toContain('tsc');
  });

  it('runs tsc when TypeScript changed', () => {
    expect(ids(FULL_STACK, analysisOf([['src/a.ts', 'ui']]))).toContain('tsc');
  });

  it('skips tsc when the project has no tsconfig', () => {
    const stack = { ...FULL_STACK, typescript: false };
    expect(ids(stack, analysisOf([['src/a.ts', 'ui']]))).not.toContain('tsc');
  });

  it('runs prisma only when a db group exists', () => {
    expect(ids(FULL_STACK, analysisOf([['src/a.ts', 'ui']]))).not.toContain('prisma');
    expect(ids(FULL_STACK, analysisOf([['prisma/schema.prisma', 'db']]))).toContain('prisma');
  });

  it('skips prisma when the project has no schema', () => {
    const stack = { ...FULL_STACK, prisma: false };
    expect(ids(stack, analysisOf([['prisma/schema.prisma', 'db']]))).not.toContain('prisma');
  });

  it('runs audit only when a deps group exists', () => {
    expect(ids(FULL_STACK, analysisOf([['src/a.ts', 'ui']]))).not.toContain('audit');
    expect(ids(FULL_STACK, analysisOf([['package.json', 'deps']]))).toContain('audit');
  });

  it('skips eslint when the project has no eslint', () => {
    const stack = { ...FULL_STACK, eslint: false };
    expect(ids(stack, analysisOf([['src/a.ts', 'ui']]))).not.toContain('eslint');
  });

  it('skips tests when there is no runner', () => {
    const stack = { ...FULL_STACK, testRunner: null };
    expect(ids(stack, analysisOf([['src/a.ts', 'ui']]))).not.toContain('tests');
  });
});

describe('deleted files are kept out of file lists', () => {
  const subject = analysisOf([
    ['src/a.ts', 'ui'],
    ['src/gone.test.ts', 'tests', 'deleted'],
  ]);

  it('eslint never receives a deleted path', () => {
    // eslint exits non-zero on a missing path, which would read as a real failure
    const eslint = selectChecks(FULL_STACK, subject, DEFAULT_POLICY).find((c) => c.id === 'eslint')!;
    expect(eslint.args).toContain('src/a.ts');
    expect(eslint.args).not.toContain('src/gone.test.ts');
  });

  it('the test runner never receives a deleted path', () => {
    const tests = selectChecks(FULL_STACK, subject, DEFAULT_POLICY).find((c) => c.id === 'tests')!;
    expect(tests.args).toContain('src/a.ts');
    expect(tests.args).not.toContain('src/gone.test.ts');
  });

  it('tsc still runs, since it reads the whole project not a file list', () => {
    expect(ids(FULL_STACK, subject)).toContain('tsc');
  });

  it('drops eslint entirely when every lintable file was deleted', () => {
    const allGone = analysisOf([['src/gone.test.ts', 'tests', 'deleted']]);
    expect(ids(FULL_STACK, allGone)).not.toContain('eslint');
    expect(ids(FULL_STACK, allGone)).not.toContain('tests');
  });
});

describe('command shape', () => {
  it('passes --passWithNoTests so a clean revert does not fail', () => {
    const tests = selectChecks(FULL_STACK, analysisOf([['src/a.ts', 'ui']]), DEFAULT_POLICY).find(
      (c) => c.id === 'tests'
    )!;
    expect(tests.args).toEqual(
      expect.arrayContaining(['vitest', 'related', '--run', '--passWithNoTests'])
    );
  });

  it('uses jest syntax for a jest project', () => {
    const stack: Stack = { ...FULL_STACK, testRunner: 'jest' };
    const tests = selectChecks(stack, analysisOf([['src/a.ts', 'ui']]), DEFAULT_POLICY).find(
      (c) => c.id === 'tests'
    )!;
    expect(tests.args).toContain('--findRelatedTests');
  });

  it.each([
    ['npm', ['audit', '--audit-level=high']],
    ['pnpm', ['audit', '--audit-level=high']],
    ['yarn', ['audit', '--level', 'high']],
  ])('builds the %s audit command', (packageManager, args) => {
    const stack: Stack = { ...FULL_STACK, packageManager: packageManager as Stack['packageManager'] };
    const audit = selectChecks(stack, analysisOf([['package.json', 'deps']]), DEFAULT_POLICY).find(
      (c) => c.id === 'audit'
    )!;
    expect(audit.command).toBe(packageManager);
    expect(audit.args).toEqual(args);
  });

  it('gives tests a longer timeout than everything else', () => {
    const checks = selectChecks(FULL_STACK, analysisOf([['src/a.ts', 'ui']]), DEFAULT_POLICY);
    expect(checks.find((c) => c.id === 'tests')!.timeoutMs).toBe(120_000);
    expect(checks.find((c) => c.id === 'tsc')!.timeoutMs).toBe(60_000);
  });

  it('marks whole-diff checks as any, and scoped checks by domain', () => {
    const checks = selectChecks(
      FULL_STACK,
      analysisOf([
        ['src/a.ts', 'ui'],
        ['prisma/schema.prisma', 'db'],
      ]),
      DEFAULT_POLICY
    );
    expect(checks.find((c) => c.id === 'tsc')!.domains).toBe('any');
    expect(checks.find((c) => c.id === 'prisma')!.domains).toEqual(['db']);
  });
});

describe('custom checks from .scope.yml', () => {
  it('appends commands for domains that are present', () => {
    const policy = { ...DEFAULT_POLICY, customChecks: { db: ['npm run db:check'] } };
    const checks = selectChecks(FULL_STACK, analysisOf([['prisma/schema.prisma', 'db']]), policy);
    const custom = checks.find((c) => c.id.startsWith('custom:'))!;

    expect(custom.command).toBe('npm');
    expect(custom.args).toEqual(['run', 'db:check']);
    expect(custom.domains).toEqual(['db']);
  });

  it('ignores commands for domains the diff did not touch', () => {
    const policy = { ...DEFAULT_POLICY, customChecks: { db: ['npm run db:check'] } };
    const checks = selectChecks(FULL_STACK, analysisOf([['src/a.ts', 'ui']]), policy);
    expect(checks.some((c) => c.id.startsWith('custom:'))).toBe(false);
  });

  it('survives a blank command line', () => {
    const policy = { ...DEFAULT_POLICY, customChecks: { ui: ['', '  '] } };
    const checks = selectChecks(FULL_STACK, analysisOf([['src/a.ts', 'ui']]), policy);
    expect(checks.some((c) => c.id.startsWith('custom:'))).toBe(false);
  });
});

describe('the secret scan is deliberately not a command', () => {
  it('never appears, because the gate already blocks on secret flags', () => {
    const checks = selectChecks(FULL_STACK, analysisOf([['src/a.ts', 'ui']]), DEFAULT_POLICY);
    expect(checks.map((c) => c.id)).not.toContain('secret-scan');
  });
});
