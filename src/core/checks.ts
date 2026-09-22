import type { Analysis, Check, CheckResult, Policy, Stack } from './types.js';

/**
 * Dev B. STUB: returns three fixed checks regardless of input.
 * Real version maps changed domains plus the detected stack onto commands.
 */
export function selectChecks(stack: Stack, analysis: Analysis, policy: Policy): Check[] {
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
