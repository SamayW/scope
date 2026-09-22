import type { Check, CheckResult, Group, Stack } from './types.js';

/**
 * STUB (M0): returns three fixed checks regardless of input.
 * Real version maps changed domains plus the detected stack onto commands.
 */
export function selectChecks(groups: Group[], stack: Stack): Check[] {
  return [
    {
      id: 'tsc',
      label: 'tsc --noEmit',
      command: 'npx',
      args: ['tsc', '--noEmit'],
      domains: ['ui', 'api', 'auth'],
      timeoutMs: 60000,
    },
    {
      id: 'prisma-validate',
      label: 'prisma validate',
      command: 'npx',
      args: ['prisma', 'validate'],
      domains: ['db'],
      timeoutMs: 30000,
    },
    {
      id: 'vitest-related',
      label: 'vitest related',
      command: 'npx',
      args: ['vitest', 'related', '--run'],
      domains: ['tests', 'ui'],
      timeoutMs: 120000,
    },
  ];
}

/**
 * STUB (M0): returns fixed results without running anything.
 * Real version runs the commands in parallel with per-command timeouts.
 */
export async function runChecks(checks: Check[], repoRoot: string): Promise<CheckResult[]> {
  return [
    {
      checkId: 'tsc',
      status: 'pass',
      exitCode: 0,
      durationMs: 1840,
      output: 'No type errors found.',
    },
    {
      checkId: 'prisma-validate',
      status: 'fail',
      exitCode: 1,
      durationMs: 620,
      output:
        'Error validating model "User": Field "isAdmin" is missing a type.\n  -->  prisma/schema.prisma:16',
    },
    {
      checkId: 'vitest-related',
      status: 'pass',
      exitCode: 0,
      durationMs: 2310,
      output: 'No related tests to run.',
    },
  ];
}
