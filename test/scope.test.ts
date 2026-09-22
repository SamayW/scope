import { describe, it, expect } from 'vitest';
import { isInScope } from '../src/core/scope.js';
import type { Hunk, Session } from '../src/core/types.js';

const hunk = (file: string): Hunk => ({
  id: `${file}#0`,
  file,
  fileStatus: 'modified',
  added: [],
  removed: [],
  patch: '',
});

const session = (globs: string[], domains: Session['allow']['domains'] = []): Session => ({
  task: 'add signup validation',
  baseline: 'abc',
  allow: { globs, domains },
  approved: [],
  createdAt: '2026-09-22T09:00:00.000Z',
});

describe('isInScope', () => {
  it('everything is in scope with no session', () => {
    expect(isInScope(hunk('src/middleware.ts'), 'auth', null)).toBe(true);
  });

  it('matches an allowed glob', () => {
    const s = session(['src/app/signup/**']);
    expect(isInScope(hunk('src/app/signup/page.tsx'), 'ui', s)).toBe(true);
    expect(isInScope(hunk('src/app/signup/nested/deep/x.ts'), 'ui', s)).toBe(true);
  });

  it('rejects a file outside every glob', () => {
    const s = session(['src/app/signup/**']);
    expect(isInScope(hunk('src/middleware.ts'), 'auth', s)).toBe(false);
    expect(isInScope(hunk('prisma/schema.prisma'), 'db', s)).toBe(false);
  });

  it('matches an allowed domain even when the path does not', () => {
    const s = session(['src/app/signup/**'], ['ui']);
    expect(isInScope(hunk('src/components/Button.tsx'), 'ui', s)).toBe(true);
    expect(isInScope(hunk('src/components/Button.tsx'), 'auth', s)).toBe(false);
  });

  it('an empty allow list puts everything out of scope', () => {
    const s = session([]);
    expect(isInScope(hunk('src/app/signup/page.tsx'), 'ui', s)).toBe(false);
  });

  it('handles a single star glob not crossing directories', () => {
    const s = session(['src/*.ts']);
    expect(isInScope(hunk('src/index.ts'), 'other', s)).toBe(true);
    expect(isInScope(hunk('src/deep/index.ts'), 'other', s)).toBe(false);
  });
});
