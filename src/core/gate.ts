import type { CheckResult, Gate, Group, Session } from './types.js';

/**
 * STUB (M0): returns a fixed blocked verdict with readable reasons.
 * Real version applies the block_on policy from .scope.yml.
 */
export function evaluateGate(groups: Group[], results: CheckResult[], session: Session): Gate {
  return {
    blocked: true,
    reasons: [
      {
        kind: 'check-failed',
        message: 'prisma validate failed: field "isAdmin" is missing a type in prisma/schema.prisma',
      },
      {
        kind: 'deleted-test',
        message: 'src/app/signup/signup.test.ts was deleted',
      },
      {
        kind: 'out-of-scope',
        message: 'auth, db and tests changed outside the allowed scope src/app/signup/**',
      },
    ],
  };
}
