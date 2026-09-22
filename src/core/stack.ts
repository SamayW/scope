import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Stack } from './types.js';

function readDeps(cwd: string): Record<string, string> {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) {
    return {};
  }

  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    return {};
  }
}

/** eslint counts as present via its dependency or any flat/legacy config file. */
function hasEslint(cwd: string, deps: Record<string, string>): boolean {
  if ('eslint' in deps) {
    return true;
  }

  try {
    return readdirSync(cwd).some(
      (entry) => entry.startsWith('.eslintrc') || entry.startsWith('eslint.config.')
    );
  } catch {
    return false;
  }
}

function detectPackageManager(cwd: string): Stack['packageManager'] {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return 'yarn';
  }
  return 'npm';
}

/** Detects the project stack from files on disk. */
export function detectStack(cwd: string): Stack {
  const deps = readDeps(cwd);

  return {
    typescript: existsSync(join(cwd, 'tsconfig.json')),
    next: 'next' in deps,
    prisma: existsSync(join(cwd, 'prisma', 'schema.prisma')),
    eslint: hasEslint(cwd, deps),
    docker: existsSync(join(cwd, 'Dockerfile')),
    testRunner: 'vitest' in deps ? 'vitest' : 'jest' in deps ? 'jest' : null,
    packageManager: detectPackageManager(cwd),
  };
}
