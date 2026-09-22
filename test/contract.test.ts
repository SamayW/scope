import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/analysis.json';
import type {
  Analysis,
  CheckStatus,
  Domain,
  FlagId,
  Group,
  Risk,
} from '../src/core/types.js';

// resolveJsonModule widens every JSON string to `string`, so a direct
// `const a: Analysis = fixture` cannot compile and a plain cast would verify
// nothing. The runtime assertions below are what actually hold the fixture to
// the contract.
const analysis = fixture as unknown as Analysis;

const DOMAINS: Domain[] = ['auth', 'db', 'deps', 'tests', 'config', 'api', 'ui', 'other'];
const RISKS: Risk[] = ['high', 'medium', 'low'];
const FLAG_IDS: FlagId[] = [
  'deleted-test',
  'skipped-test',
  'removed-assertion',
  'secret',
  'env-edit',
  'auth-change',
  'schema-change',
  'removed-validation',
  'new-dependency',
  'eslint-disable',
  'any-type',
  'empty-catch',
  'ci-edit',
];

describe('fixtures/analysis.json matches the contract', () => {
  it('has 4 groups', () => {
    expect(analysis.groups.length).toBe(4);
  });

  it('has a well formed session', () => {
    const { session } = analysis;
    expect(session.task).toBe('add signup form validation');
    expect(session.allowGlobs).toContain('src/app/signup/**');
    expect(typeof session.baseline).toBe('string');
    expect(Array.isArray(session.allowDomains)).toBe(true);
    expect(Array.isArray(session.approvedHunks)).toBe(true);
    expect(typeof session.createdAt).toBe('string');
    expect(typeof analysis.generatedAt).toBe('string');
  });

  it('covers the four demo domains', () => {
    expect(analysis.groups.map((g) => g.domain).sort()).toEqual(['auth', 'db', 'tests', 'ui']);
  });

  it.each(['auth', 'db', 'tests', 'ui'])('group %s satisfies Group', (domain) => {
    const group = analysis.groups.find((g) => g.domain === domain) as Group;
    expect(group).toBeDefined();

    expect(DOMAINS).toContain(group.domain);
    expect(RISKS).toContain(group.risk);
    expect(typeof group.score).toBe('number');
    expect(typeof group.inScope).toBe('boolean');
    expect(typeof group.approved).toBe('boolean');
    expect(Array.isArray(group.flags)).toBe(true);
    expect(group.hunks.length).toBeGreaterThan(0);

    for (const flag of [...group.flags, ...group.hunks.flatMap((h) => h.flags)]) {
      expect(FLAG_IDS).toContain(flag.id);
      expect(RISKS).toContain(flag.risk);
      expect(typeof flag.message).toBe('string');
      expect(typeof flag.file).toBe('string');
    }

    for (const hunk of group.hunks) {
      expect(typeof hunk.id).toBe('string');
      expect(typeof hunk.file).toBe('string');
      expect(DOMAINS).toContain(hunk.domain);
      expect(typeof hunk.added).toBe('number');
      expect(typeof hunk.removed).toBe('number');
      expect(typeof hunk.score).toBe('number');
      expect(typeof hunk.inScope).toBe('boolean');
      expect(hunk.patch).toMatch(/^diff --git /);
      expect(hunk.patch).toMatch(/^@@ .* @@/m);
    }
  });

  it('marks ui in scope and everything else out of scope', () => {
    for (const group of analysis.groups) {
      expect(group.inScope).toBe(group.domain === 'ui');
    }
  });

  it('flags the deleted test', () => {
    const tests = analysis.groups.find((g) => g.domain === 'tests') as Group;
    expect(tests.flags.map((f) => f.id)).toContain('deleted-test');
  });
});

describe('stubs return contract shaped data', () => {
  it('analyze returns the fixture', async () => {
    const { analyze } = await import('../src/core/analyze.js');
    const result = await analyze();
    expect(result.groups.length).toBe(4);
  });

  it('selectChecks and runChecks agree, gate blocks', async () => {
    const { selectChecks, runChecks } = await import('../src/core/checks.js');
    const { evaluateGate } = await import('../src/core/gate.js');

    const checks = selectChecks(analysis.groups, {
      typescript: true,
      next: true,
      prisma: true,
      vitest: true,
      jest: false,
      eslint: true,
      docker: false,
    });
    expect(checks.length).toBe(3);

    const results = await runChecks(checks, process.cwd());
    const byId = Object.fromEntries(results.map((r) => [r.checkId, r.status])) as Record<
      string,
      CheckStatus
    >;
    expect(byId['tsc']).toBe('pass');
    expect(byId['prisma-validate']).toBe('fail');
    expect(byId['vitest-related']).toBe('pass');

    const gate = evaluateGate(analysis.groups, results, analysis.session);
    expect(gate.blocked).toBe(true);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });
});
