import type { Analysis, CheckResult, GateResult, Policy } from './types.js';

export const DEFAULT_POLICY: Policy = {
  blockOn: ['failing_checks', 'deleted_tests', 'secrets', 'out_of_scope'],
};

/** STUB until A9: always the default policy. */
export function loadPolicy(cwd: string): Policy {
  return DEFAULT_POLICY;
}

/** STUB until A9: fixed blocked verdict. */
export function evaluateGate(
  analysis: Analysis,
  results: CheckResult[],
  policy: Policy
): GateResult {
  return {
    blocked: true,
    reasons: [
      { kind: 'failing_checks', message: 'Check failed: prisma validate' },
      { kind: 'deleted_tests', message: 'src/app/signup/signup.test.ts was deleted' },
      { kind: 'out_of_scope', message: 'auth, db and tests changed outside the allowed scope' },
    ],
  };
}
