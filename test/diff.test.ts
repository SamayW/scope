import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseHunks } from '../src/core/diff.js';

const sample = readFileSync(resolve(__dirname, '../fixtures/sample.diff'), 'utf8');
const hunks = parseHunks(sample);

describe('parseHunks', () => {
  it('returns one hunk per chunk, not per file', () => {
    // 4 files, but page.tsx has 2 chunks
    expect(hunks.length).toBe(5);
    expect(new Set(hunks.map((h) => h.file)).size).toBe(4);
  });

  it('builds stable file-scoped ids', () => {
    expect(hunks.map((h) => h.id).sort()).toEqual([
      'prisma/schema.prisma#0',
      'src/app/signup/page.tsx#0',
      'src/app/signup/page.tsx#1',
      'src/app/signup/signup.test.ts#0',
      'src/middleware.ts#0',
    ]);
  });

  it('marks the removed test file as deleted', () => {
    const test = hunks.find((h) => h.file === 'src/app/signup/signup.test.ts')!;
    expect(test.fileStatus).toBe('deleted');
    expect(test.added).toEqual([]);
    expect(test.removed.length).toBeGreaterThan(0);
  });

  it('marks edited files as modified', () => {
    expect(hunks.find((h) => h.file === 'src/middleware.ts')!.fileStatus).toBe('modified');
  });

  it('strips the +/- prefix so risk rules can match content', () => {
    const middleware = hunks.find((h) => h.file === 'src/middleware.ts')!;
    expect(middleware.added).toContain('  return NextResponse.next();');
    expect(middleware.added.every((line) => !line.startsWith('+'))).toBe(true);
  });

  it('captures the planted schema field', () => {
    const schema = hunks.find((h) => h.file === 'prisma/schema.prisma')!;
    expect(schema.added).toContain('  isAdmin');
  });

  it('rebuilds the index line as one line, the way git wrote it', () => {
    // parse-diff splits "index abc..def 100644" into two array entries; a naive
    // rejoin emits a bogus second "index 100644" line and the patch is invalid
    for (const hunk of hunks) {
      const indexLines = hunk.patch.split('\n').filter((l) => l.startsWith('index '));
      expect(indexLines.length).toBeLessThanOrEqual(1);
      for (const line of indexLines) {
        expect(line).toMatch(/^index [0-9a-f]+\.\.[0-9a-f]+( \d{6})?$/);
      }
    }
  });

  it('returns nothing for an empty diff', () => {
    expect(parseHunks('')).toEqual([]);
    expect(parseHunks('   \n')).toEqual([]);
  });

  it('every patch carries headers and a trailing newline', () => {
    for (const hunk of hunks) {
      const lines = hunk.patch.split('\n');
      expect(lines[0]).toMatch(/^diff --git a\/.+ b\/.+$/);
      expect(hunk.patch).toMatch(/^--- (\/dev\/null|a\/.+)$/m);
      expect(hunk.patch).toMatch(/^\+\+\+ (\/dev\/null|b\/.+)$/m);
      expect(hunk.patch).toMatch(/^@@ .* @@/m);
      expect(hunk.patch.endsWith('\n')).toBe(true);
    }
  });
});

describe('patch is applyable, which is what the revert feature depends on', () => {
  let clone: string;

  beforeAll(() => {
    // Clone the demo repo so the real one is never touched.
    clone = mkdtempSync(join(tmpdir(), 'scope-demo-clone-'));
    execFileSync('git', ['clone', '-q', resolve(__dirname, '../../scope-demo'), clone]);
    execFileSync('git', ['checkout', '-q', 'agent'], { cwd: clone });
  });

  afterAll(() => {
    rmSync(clone, { recursive: true, force: true });
  });

  it.each(['src/middleware.ts#0', 'prisma/schema.prisma#0', 'src/app/signup/signup.test.ts#0'])(
    'git apply --check -R accepts %s',
    (id) => {
      const hunk = hunks.find((h) => h.id === id)!;
      const patchFile = join(clone, 'hunk.patch');
      writeFileSync(patchFile, hunk.patch);

      expect(() =>
        execFileSync('git', ['apply', '--check', '-R', 'hunk.patch'], {
          cwd: clone,
          stdio: 'pipe',
        })
      ).not.toThrow();
    }
  );
});
