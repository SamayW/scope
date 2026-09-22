import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { detectStack } from '../src/core/stack.js';

let dir: string;

const pkg = (content: object) =>
  writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scope-stack-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('detectStack', () => {
  it('survives a directory with no package.json', () => {
    const stack = detectStack(dir);
    expect(stack.next).toBe(false);
    expect(stack.testRunner).toBeNull();
    expect(stack.packageManager).toBe('npm');
  });

  it('survives a malformed package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{ not json');
    expect(() => detectStack(dir)).not.toThrow();
    expect(detectStack(dir).next).toBe(false);
  });

  it('reads both dependencies and devDependencies', () => {
    pkg({ dependencies: { next: '15' }, devDependencies: { vitest: '3' } });
    const stack = detectStack(dir);
    expect(stack.next).toBe(true);
    expect(stack.testRunner).toBe('vitest');
  });

  it('detects typescript from tsconfig, not the dependency', () => {
    pkg({ devDependencies: { typescript: '5' } });
    expect(detectStack(dir).typescript).toBe(false);
    writeFileSync(join(dir, 'tsconfig.json'), '{}');
    expect(detectStack(dir).typescript).toBe(true);
  });

  it('detects prisma from the schema file', () => {
    pkg({ devDependencies: { prisma: '6' } });
    expect(detectStack(dir).prisma).toBe(false);
    mkdirSync(join(dir, 'prisma'));
    writeFileSync(join(dir, 'prisma', 'schema.prisma'), '');
    expect(detectStack(dir).prisma).toBe(true);
  });

  it('prefers vitest when both runners are present', () => {
    pkg({ devDependencies: { vitest: '3', jest: '29' } });
    expect(detectStack(dir).testRunner).toBe('vitest');
  });

  it('falls back to jest', () => {
    pkg({ devDependencies: { jest: '29' } });
    expect(detectStack(dir).testRunner).toBe('jest');
  });

  it('returns null when there is no test runner', () => {
    pkg({ dependencies: { next: '15' } });
    expect(detectStack(dir).testRunner).toBeNull();
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
  ])('detects %s -> %s', (lockfile, manager) => {
    pkg({});
    writeFileSync(join(dir, lockfile), '');
    expect(detectStack(dir).packageManager).toBe(manager);
  });

  it('detects eslint from the dependency', () => {
    pkg({ devDependencies: { eslint: '9' } });
    expect(detectStack(dir).eslint).toBe(true);
  });

  it.each(['.eslintrc', '.eslintrc.json', 'eslint.config.js', 'eslint.config.mjs'])(
    'detects eslint from %s with no dependency',
    (file) => {
      pkg({});
      writeFileSync(join(dir, file), '');
      expect(detectStack(dir).eslint).toBe(true);
    }
  );
});

describe('detectStack on the real demo repo', () => {
  it('identifies it as Next plus Prisma plus vitest on npm', () => {
    const stack = detectStack(resolve(__dirname, '../../scope-demo'));
    expect(stack).toEqual({
      typescript: true,
      next: true,
      prisma: true,
      eslint: false,
      docker: false,
      testRunner: 'vitest',
      packageManager: 'npm',
    });
  });
});
