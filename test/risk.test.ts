import { describe, it, expect } from 'vitest';
import { scoreHunk, toLevel, SECRET_PATTERNS } from '../src/core/risk.js';
import type { Domain, FileStatus, Hunk } from '../src/core/types.js';

function hunk(over: Partial<Hunk> = {}): Hunk {
  return {
    id: 'x#0',
    file: 'src/thing.ts',
    fileStatus: 'modified' as FileStatus,
    added: [],
    removed: [],
    patch: '',
    ...over,
  };
}

const ids = (h: Hunk, d: Domain = 'other') => scoreHunk(h, d).map((f) => f.id);

describe('toLevel', () => {
  it.each([
    [0, 'low'],
    [3, 'low'],
    [4, 'medium'],
    [9, 'medium'],
    [10, 'high'],
    [40, 'high'],
  ])('%i -> %s', (score, level) => {
    expect(toLevel(score)).toBe(level);
  });
});

describe('each rule fires on a match and stays quiet otherwise', () => {
  it('deleted-test: a deleted test file', () => {
    expect(ids(hunk({ fileStatus: 'deleted' }), 'tests')).toContain('deleted-test');
    expect(ids(hunk({ fileStatus: 'deleted' }), 'ui')).not.toContain('deleted-test');
  });

  it('deleted-test: a test file that lost more than it gained', () => {
    expect(ids(hunk({ removed: ['a', 'b'], added: ['c'] }), 'tests')).toContain('deleted-test');
    expect(ids(hunk({ removed: ['a'], added: ['b', 'c'] }), 'tests')).not.toContain('deleted-test');
  });

  it('skip-only', () => {
    expect(ids(hunk({ added: ["  it.skip('x', () => {});"] }))).toContain('skip-only');
    expect(ids(hunk({ added: ["  describe.only('x', () => {});"] }))).toContain('skip-only');
    expect(ids(hunk({ added: ["  it('x', () => {});"] }))).not.toContain('skip-only');
  });

  it('removed-assertion', () => {
    expect(ids(hunk({ removed: ['    expect(a).toBe(1);'] }))).toContain('removed-assertion');
    expect(ids(hunk({ removed: ['    assert.equal(a, 1);'] }))).toContain('removed-assertion');
    // only counts when removed, not when added
    expect(ids(hunk({ added: ['    expect(a).toBe(1);'] }))).not.toContain('removed-assertion');
  });

  it('secret', () => {
    expect(ids(hunk({ added: ['const k = "sk-test-123456789abcdef";'] }))).toContain('secret');
    expect(ids(hunk({ added: ['const k = "AKIAIOSFODNN7EXAMPLE";'] }))).toContain('secret');
    expect(ids(hunk({ added: ['password = "hunter2xyz"'] }))).toContain('secret');
    expect(ids(hunk({ added: ['-----BEGIN RSA PRIVATE KEY-----'] }))).toContain('secret');
    expect(ids(hunk({ added: ['const k = process.env.API_KEY;'] }))).not.toContain('secret');
  });

  it('env-file', () => {
    expect(ids(hunk({ file: '.env' }))).toContain('env-file');
    expect(ids(hunk({ file: 'apps/web/.env.local' }))).toContain('env-file');
    expect(ids(hunk({ file: 'src/environment.ts' }))).not.toContain('env-file');
  });

  it('sensitive-domain', () => {
    expect(ids(hunk(), 'auth')).toContain('sensitive-domain');
    expect(ids(hunk(), 'db')).toContain('sensitive-domain');
    expect(ids(hunk(), 'ui')).not.toContain('sensitive-domain');
  });

  it('new-dependency', () => {
    const dep = hunk({ file: 'package.json', added: ['    "left-pad": "^1.3.0",'] });
    expect(ids(dep, 'deps')).toContain('new-dependency');
    // same line outside the deps domain is not a dependency change
    expect(ids(dep, 'ui')).not.toContain('new-dependency');
  });

  it('lint-suppression', () => {
    expect(ids(hunk({ added: ['// eslint-disable-next-line'] }))).toContain('lint-suppression');
    expect(ids(hunk({ added: ['// @ts-ignore'] }))).toContain('lint-suppression');
    expect(ids(hunk({ added: ['let x: any = 1;'] }))).toContain('lint-suppression');
    // "anything" must not trip the ": any" rule
    expect(ids(hunk({ added: ['let x: anything = 1;'] }))).not.toContain('lint-suppression');
  });

  it('empty-catch', () => {
    expect(ids(hunk({ added: ['} catch (e) {}'] }))).toContain('empty-catch');
    expect(ids(hunk({ added: ['} catch {}'] }))).toContain('empty-catch');
    expect(ids(hunk({ added: ['} catch (e) { log(e); }'] }))).not.toContain('empty-catch');
  });

  it('ci-change', () => {
    expect(ids(hunk({ file: '.github/workflows/ci.yml' }))).toContain('ci-change');
    expect(ids(hunk({ file: 'src/github.ts' }))).not.toContain('ci-change');
  });
});

describe('scoring', () => {
  it('a clean UI hunk trips nothing', () => {
    expect(scoreHunk(hunk({ added: ['const x = 1;'] }), 'ui')).toEqual([]);
  });

  it('stacks multiple flags on one hunk', () => {
    const flags = scoreHunk(
      hunk({
        file: 'src/app/signup/page.tsx',
        added: ['// eslint-disable-next-line', 'const key = "sk-test-123456789abcdef";'],
      }),
      'ui'
    );
    expect(flags.map((f) => f.id).sort()).toEqual(['lint-suppression', 'secret']);
    expect(flags.reduce((sum, f) => sum + f.points, 0)).toBe(13);
  });

  it('a deleted auth test is the worst case', () => {
    const flags = scoreHunk(hunk({ file: 'src/auth/login.test.ts', fileStatus: 'deleted' }), 'tests');
    expect(flags.reduce((sum, f) => sum + f.points, 0)).toBeGreaterThanOrEqual(10);
    expect(toLevel(flags.reduce((sum, f) => sum + f.points, 0))).toBe('high');
  });

  it('every flag carries a readable message', () => {
    const flags = scoreHunk(hunk({ fileStatus: 'deleted' }), 'tests');
    for (const flag of flags) {
      expect(flag.message.length).toBeGreaterThan(5);
      expect(flag.message).not.toMatch(/undefined/);
    }
  });

  it('SECRET_PATTERNS is exported for the secret-scan check to reuse', () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThan(0);
    expect(SECRET_PATTERNS.every((p) => p instanceof RegExp)).toBe(true);
  });
});
