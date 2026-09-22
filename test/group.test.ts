import { describe, it, expect } from 'vitest';
import { buildGroups } from '../src/core/group.js';
import type { ClassifiedHunk, Domain } from '../src/core/types.js';

function ch(over: Partial<ClassifiedHunk> & { domain: Domain }): ClassifiedHunk {
  return {
    id: 'x#0',
    file: 'src/thing.ts',
    fileStatus: 'modified',
    added: [],
    removed: [],
    patch: '',
    flags: [],
    score: 0,
    inScope: true,
    approved: false,
    ...over,
  };
}

describe('buildGroups', () => {
  it('buckets hunks by domain', () => {
    const groups = buildGroups([
      ch({ domain: 'ui', id: 'a#0' }),
      ch({ domain: 'ui', id: 'b#0' }),
      ch({ domain: 'auth', id: 'c#0' }),
    ]);
    expect(groups.length).toBe(2);
    expect(groups.find((g) => g.domain === 'ui')!.hunks.length).toBe(2);
  });

  it('doubles the score of unapproved out-of-scope hunks', () => {
    const [group] = buildGroups([ch({ domain: 'auth', score: 6, inScope: false })]);
    expect(group.score).toBe(12);
    expect(group.risk).toBe('high');
    expect(group.outOfScope).toBe(true);
  });

  it('does not double an approved hunk', () => {
    const [group] = buildGroups([
      ch({ domain: 'auth', score: 6, inScope: false, approved: true }),
    ]);
    expect(group.score).toBe(6);
    expect(group.risk).toBe('medium');
    expect(group.outOfScope).toBe(false);
  });

  it('does not double an in-scope hunk', () => {
    const [group] = buildGroups([ch({ domain: 'ui', score: 6, inScope: true })]);
    expect(group.score).toBe(6);
  });

  it('sums across hunks in the same domain', () => {
    const [group] = buildGroups([
      ch({ domain: 'db', id: 'a#0', score: 6, inScope: false }),
      ch({ domain: 'db', id: 'b#0', score: 3, inScope: true }),
    ]);
    expect(group.score).toBe(6 * 2 + 3);
  });

  it('sorts by score descending', () => {
    const groups = buildGroups([
      ch({ domain: 'ui', score: 1 }),
      ch({ domain: 'tests', score: 10, inScope: false }),
      ch({ domain: 'deps', score: 4 }),
    ]);
    expect(groups.map((g) => g.domain)).toEqual(['tests', 'deps', 'ui']);
  });

  it('breaks score ties by domain so the order is deterministic', () => {
    const groups = buildGroups([
      ch({ domain: 'db', score: 6, inScope: false }),
      ch({ domain: 'auth', score: 6, inScope: false }),
    ]);
    expect(groups.map((g) => g.domain)).toEqual(['auth', 'db']);
  });

  it('leaves checks empty for Dev B to fill', () => {
    const [group] = buildGroups([ch({ domain: 'ui' })]);
    expect(group.checks).toEqual([]);
  });

  it('returns nothing for no hunks', () => {
    expect(buildGroups([])).toEqual([]);
  });
});
