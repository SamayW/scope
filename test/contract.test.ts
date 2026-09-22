import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/analysis.json';
import type { Analysis, Domain, FileStatus, FlagId, Group, RiskLevel } from '../src/core/types.js';

// resolveJsonModule widens every JSON string to `string`, so a direct
// `const a: Analysis = fixture` cannot compile and a plain cast would verify
// nothing. The runtime assertions below are what actually hold the fixture to
// the contract.
const analysis = fixture as unknown as Analysis;

const DOMAINS: Domain[] = ['auth', 'db', 'deps', 'tests', 'config', 'api', 'ui', 'other'];
const RISKS: RiskLevel[] = ['high', 'medium', 'low'];
const FILE_STATUSES: FileStatus[] = ['added', 'deleted', 'renamed', 'modified'];
const FLAG_IDS: FlagId[] = [
  'deleted-test',
  'skip-only',
  'removed-assertion',
  'secret',
  'env-file',
  'sensitive-domain',
  'new-dependency',
  'lint-suppression',
  'empty-catch',
  'ci-change',
];

describe('fixtures/analysis.json matches the contract', () => {
  it('has 4 groups', () => {
    expect(analysis.groups.length).toBe(4);
  });

  it('has a well formed session', () => {
    const session = analysis.session!;
    expect(session.task).toBe('add signup form validation');
    expect(session.allow.globs).toContain('src/app/signup/**');
    expect(Array.isArray(session.allow.domains)).toBe(true);
    expect(Array.isArray(session.approved)).toBe(true);
    expect(typeof session.baseline).toBe('string');
    expect(typeof session.createdAt).toBe('string');
  });

  it('lists every changed file', () => {
    const fromHunks = new Set(analysis.groups.flatMap((g) => g.hunks.map((h) => h.file)));
    expect(new Set(analysis.changedFiles)).toEqual(fromHunks);
  });

  it('covers the four demo domains', () => {
    expect(analysis.groups.map((g) => g.domain).sort()).toEqual(['auth', 'db', 'tests', 'ui']);
  });

  it('is sorted by score descending', () => {
    const scores = analysis.groups.map((g) => g.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it.each(['auth', 'db', 'tests', 'ui'])('group %s satisfies Group', (domain) => {
    const group = analysis.groups.find((g) => g.domain === domain) as Group;
    expect(group).toBeDefined();

    expect(DOMAINS).toContain(group.domain);
    expect(RISKS).toContain(group.risk);
    expect(typeof group.score).toBe('number');
    expect(typeof group.outOfScope).toBe('boolean');
    expect(Array.isArray(group.checks)).toBe(true);
    expect(group.hunks.length).toBeGreaterThan(0);

    for (const hunk of group.hunks) {
      expect(typeof hunk.id).toBe('string');
      expect(typeof hunk.file).toBe('string');
      expect(FILE_STATUSES).toContain(hunk.fileStatus);
      expect(DOMAINS).toContain(hunk.domain);
      expect(Array.isArray(hunk.added)).toBe(true);
      expect(Array.isArray(hunk.removed)).toBe(true);
      expect(typeof hunk.score).toBe('number');
      expect(typeof hunk.inScope).toBe('boolean');
      expect(typeof hunk.approved).toBe('boolean');

      // The patch must stay applyable by `git apply -R`.
      expect(hunk.patch).toMatch(/^diff --git /);
      expect(hunk.patch).toMatch(/^@@ .* @@/m);
      expect(hunk.patch.endsWith('\n')).toBe(true);

      for (const flag of hunk.flags) {
        expect(FLAG_IDS).toContain(flag.id);
        expect(typeof flag.message).toBe('string');
        expect(typeof flag.points).toBe('number');
      }

      // score is the sum of its flags' points
      expect(hunk.score).toBe(hunk.flags.reduce((sum, f) => sum + f.points, 0));
    }

    // group score doubles unapproved out-of-scope hunks
    const expected = group.hunks.reduce(
      (sum, h) => sum + (!h.inScope && !h.approved ? h.score * 2 : h.score),
      0
    );
    expect(group.score).toBe(expected);
    expect(group.outOfScope).toBe(group.hunks.some((h) => !h.inScope && !h.approved));
  });

  it('marks ui in scope and everything else out of scope', () => {
    for (const group of analysis.groups) {
      expect(group.outOfScope).toBe(group.domain !== 'ui');
    }
  });

  it('flags the deleted test', () => {
    const tests = analysis.groups.find((g) => g.domain === 'tests') as Group;
    expect(tests.hunks.flatMap((h) => h.flags).map((f) => f.id)).toContain('deleted-test');
  });
});
