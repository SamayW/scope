import execa from 'execa';
import type { Analysis, Check, CheckResult } from './types.js';

/** Keep the tail: compilers and test runners put the useful part last. */
const MAX_OUTPUT_LINES = 50;

async function runOne(check: Check, cwd: string): Promise<CheckResult> {
  const started = Date.now();

  const result = await execa(check.command, check.args, {
    cwd,
    reject: false,
    timeout: check.timeoutMs,
    all: true,
  });

  // A command that does not exist resolves with no numeric exit code.
  const exitCode = typeof result.exitCode === 'number' ? result.exitCode : null;
  const status: CheckResult['status'] = result.timedOut
    ? 'timeout'
    : exitCode === 0
      ? 'pass'
      : 'fail';

  // With reject:false a command that fails to spawn carries its reason in
  // shortMessage, which execa 5 does not put on the resolved type.
  const spawnFailure = (result as { shortMessage?: string }).shortMessage;
  const raw =
    result.all || [result.stdout, result.stderr].filter(Boolean).join('\n') || spawnFailure || '';

  return {
    checkId: check.id,
    label: check.label,
    status,
    exitCode,
    durationMs: Date.now() - started,
    output: raw.split('\n').slice(-MAX_OUTPUT_LINES).join('\n'),
  };
}

/**
 * Runs every check in parallel. `onResult` fires as each one lands so the
 * sidebar can stream results instead of waiting for the slowest.
 */
export async function runChecks(
  checks: Check[],
  cwd: string,
  onResult?: (result: CheckResult) => void
): Promise<CheckResult[]> {
  return Promise.all(
    checks.map(async (check) => {
      const result = await runOne(check, cwd);
      onResult?.(result);
      return result;
    })
  );
}

/** Files each result into every group it applies to. Pure. */
export function attachResults(
  analysis: Analysis,
  results: CheckResult[],
  checks: Check[]
): Analysis {
  const byId = new Map(checks.map((check) => [check.id, check]));

  return {
    ...analysis,
    groups: analysis.groups.map((group) => ({
      ...group,
      checks: results.filter((result) => {
        const check = byId.get(result.checkId);
        if (!check) {
          return false;
        }
        return check.domains === 'any' || check.domains.includes(group.domain);
      }),
    })),
  };
}
