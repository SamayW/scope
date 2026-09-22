import type { Analysis, Check, CheckResult, Domain, Policy, Stack } from './types.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 120_000;

const TS_EXTENSIONS = ['.ts', '.tsx'];
const LINTABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const hasExtension = (file: string, extensions: string[]) =>
  extensions.some((extension) => file.endsWith(extension));

/**
 * Files the diff deleted. eslint and the test runners exit non-zero when handed
 * a path that no longer exists, which would read as a real failure, so they are
 * filtered out of every file list below.
 */
function survivingFiles(analysis: Analysis): string[] {
  const deleted = new Set(
    analysis.groups
      .flatMap((group) => group.hunks)
      .filter((hunk) => hunk.fileStatus === 'deleted')
      .map((hunk) => hunk.file)
  );

  return analysis.changedFiles.filter((file) => !deleted.has(file));
}

function auditArgs(packageManager: Stack['packageManager']): string[] {
  // yarn spells the threshold differently from npm and pnpm
  return packageManager === 'yarn'
    ? ['audit', '--level', 'high']
    : ['audit', '--audit-level=high'];
}

/** Picks only the checks the diff actually warrants. Pure. */
export function selectChecks(stack: Stack, analysis: Analysis, policy: Policy): Check[] {
  const checks: Check[] = [];
  const domains = new Set(analysis.groups.map((group) => group.domain));
  const alive = survivingFiles(analysis);

  if (stack.typescript && analysis.changedFiles.some((f) => hasExtension(f, TS_EXTENSIONS))) {
    checks.push({
      id: 'tsc',
      label: 'tsc --noEmit',
      command: 'npx',
      args: ['tsc', '--noEmit'],
      domains: 'any',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  const lintable = alive.filter((f) => hasExtension(f, LINTABLE_EXTENSIONS));
  if (stack.eslint && lintable.length > 0) {
    checks.push({
      id: 'eslint',
      label: `eslint (${lintable.length} file${lintable.length === 1 ? '' : 's'})`,
      command: 'npx',
      args: ['eslint', ...lintable],
      domains: 'any',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  if (stack.prisma && domains.has('db')) {
    checks.push({
      id: 'prisma',
      label: 'prisma validate',
      command: 'npx',
      args: ['prisma', 'validate'],
      domains: ['db'],
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  if (domains.has('deps')) {
    checks.push({
      id: 'audit',
      label: `${stack.packageManager} audit`,
      command: stack.packageManager,
      args: auditArgs(stack.packageManager),
      domains: ['deps'],
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  const code = alive.filter((f) => hasExtension(f, CODE_EXTENSIONS));
  if (code.length > 0 && stack.testRunner === 'vitest') {
    checks.push({
      id: 'tests',
      label: 'vitest related',
      command: 'npx',
      // without --passWithNoTests a revert that leaves nothing related fails
      args: ['vitest', 'related', '--run', '--passWithNoTests', ...code],
      domains: 'any',
      timeoutMs: TEST_TIMEOUT_MS,
    });
  } else if (code.length > 0 && stack.testRunner === 'jest') {
    checks.push({
      id: 'tests',
      label: 'jest findRelatedTests',
      command: 'npx',
      args: ['jest', '--findRelatedTests', '--passWithNoTests', ...code],
      domains: 'any',
      timeoutMs: TEST_TIMEOUT_MS,
    });
  }

  for (const domain of domains) {
    const commands = policy.customChecks?.[domain] ?? [];
    commands.forEach((line, index) => {
      const [command, ...args] = line.split(' ').filter(Boolean);
      if (!command) {
        return;
      }
      checks.push({
        id: `custom:${domain}:${index}`,
        label: line,
        command,
        args,
        domains: [domain as Domain],
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
    });
  }

  return checks;
}

/** Dev B. STUB: returns fixed results without running anything. */
export async function runChecks(checks: Check[], cwd: string): Promise<CheckResult[]> {
  return [
    {
      checkId: 'tsc',
      label: 'tsc --noEmit',
      status: 'pass',
      exitCode: 0,
      durationMs: 1840,
      output: 'No type errors found.',
    },
    {
      checkId: 'prisma-validate',
      label: 'prisma validate',
      status: 'fail',
      exitCode: 1,
      durationMs: 620,
      output: 'Error validating model "User": This field declaration is invalid.',
    },
    {
      checkId: 'vitest-related',
      label: 'vitest related',
      status: 'pass',
      exitCode: 0,
      durationMs: 2310,
      output: 'No related tests to run.',
    },
  ];
}
