import { describe, it, expect } from 'vitest';
import { classify } from '../src/core/classify.js';
import type { Hunk } from '../src/core/types.js';

function hunk(file: string, added: string[] = [], removed: string[] = []): Hunk {
  return { id: `${file}#0`, file, fileStatus: 'modified', added, removed, patch: '' };
}

describe('classify by path', () => {
  it.each([
    ['src/app/signup/signup.test.ts', 'tests'],
    ['src/__tests__/helper.ts', 'tests'],
    ['src/thing.spec.ts', 'tests'],
    ['package.json', 'deps'],
    ['package-lock.json', 'deps'],
    ['yarn.lock', 'deps'],
    ['prisma/schema.prisma', 'db'],
    ['prisma/migrations/001_init/migration.sql', 'db'],
    ['src/middleware.ts', 'auth'],
    ['src/lib/jwt.ts', 'auth'],
    ['.env.local', 'config'],
    ['Dockerfile', 'config'],
    ['.github/workflows/ci.yml', 'config'],
    ['next.config.js', 'config'],
    ['src/app/api/users/route.ts', 'api'],
    ['src/controllers/user.ts', 'api'],
    ['src/components/Button.tsx', 'ui'],
    ['src/app/signup/page.tsx', 'ui'],
    ['README.md', 'other'],
    ['scripts/build.sh', 'other'],
  ])('%s -> %s', (file, domain) => {
    expect(classify(hunk(file))).toBe(domain);
  });

  it('a .test.tsx file is a test, not UI', () => {
    // Both the tests rule and the ui rule match this path. Order decides.
    expect(classify(hunk('src/components/Button.test.tsx'))).toBe('tests');
  });

  it('an auth route is auth, not api', () => {
    expect(classify(hunk('src/app/api/auth/route.ts'))).toBe('auth');
  });
});

describe('classify by content when the path says nothing', () => {
  it('detects auth from bcrypt', () => {
    expect(classify(hunk('src/lib/helper.ts', ['const h = bcrypt.hashSync(pw);']))).toBe('auth');
  });

  it('detects auth from getServerSession', () => {
    expect(classify(hunk('src/lib/helper.ts', ['const s = await getServerSession();']))).toBe(
      'auth'
    );
  });

  it('detects db from $queryRaw', () => {
    expect(classify(hunk('src/lib/query.ts', ['await db.$queryRaw`SELECT 1`;']))).toBe('db');
  });

  it('detects tests from a describe block', () => {
    expect(classify(hunk('src/lib/thing.ts', ["describe('x', () => {}));"]))).toBe('tests');
  });

  it('matches removed lines too, so deleting an assertion still classifies', () => {
    expect(classify(hunk('src/lib/thing.ts', [], ["  it('works', () => {});"]))).toBe('tests');
  });

  it('falls through to other when nothing matches', () => {
    expect(classify(hunk('src/lib/thing.ts', ['const x = 1;']))).toBe('other');
  });
});
