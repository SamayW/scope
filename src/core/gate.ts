import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Analysis, BlockRule, CheckResult, GateReason, GateResult, Policy } from './types.js';

const ALL_RULES: BlockRule[] = ['failing_checks', 'deleted_tests', 'secrets', 'out_of_scope'];

export const DEFAULT_POLICY: Policy = { blockOn: [...ALL_RULES] };

const isBlockRule = (value: unknown): value is BlockRule =>
  typeof value === 'string' && (ALL_RULES as string[]).includes(value);

/** Reads .scope.yml if present, else the default policy. */
export function loadPolicy(cwd: string): Policy {
  const path = join(cwd, '.scope.yml');
  if (!existsSync(path)) {
    return DEFAULT_POLICY;
  }

  try {
    const raw = (parseYaml(readFileSync(path, 'utf8')) ?? {}) as Record<string, unknown>;
    // accept both block_on (yaml convention) and blockOn
    const configured = raw.block_on ?? raw.blockOn;
    const blockOn = Array.isArray(configured) ? configured.filter(isBlockRule) : null;

    return {
      blockOn: blockOn && blockOn.length > 0 ? blockOn : DEFAULT_POLICY.blockOn,
      // the yaml key stays `groups:` as documented in the plan
      customChecks: (raw.groups as Policy['customChecks']) ?? undefined,
    };
  } catch {
    // a malformed config must not silently disable the gate
    return DEFAULT_POLICY;
  }
}

/** Decides whether the push is blocked, with one readable reason per issue. Pure. */
export function evaluateGate(
  analysis: Analysis,
  results: CheckResult[],
  policy: Policy
): GateResult {
  const enabled = new Set(policy.blockOn);
  const reasons: GateReason[] = [];
  const hunks = analysis.groups.flatMap((group) => group.hunks);

  if (enabled.has('failing_checks')) {
    for (const result of results) {
      if (result.status === 'fail' || result.status === 'timeout') {
        const verb = result.status === 'timeout' ? 'timed out' : 'failed';
        reasons.push({ kind: 'failing_checks', message: `Check ${verb}: ${result.label}` });
      }
    }
  }

  if (enabled.has('deleted_tests')) {
    for (const hunk of hunks) {
      if (hunk.approved) {
        continue;
      }
      for (const flag of hunk.flags) {
        if (flag.id === 'deleted-test' || flag.id === 'skip-only') {
          reasons.push({ kind: 'deleted_tests', message: `${flag.message}: ${hunk.file}` });
        }
      }
    }
  }

  if (enabled.has('secrets')) {
    // Secrets block even when the hunk is approved. Approving a hunk is a
    // judgement about scope, not permission to commit a credential.
    for (const hunk of hunks) {
      if (hunk.flags.some((flag) => flag.id === 'secret')) {
        reasons.push({ kind: 'secrets', message: `Possible secret in ${hunk.file}` });
      }
    }
  }

  if (enabled.has('out_of_scope')) {
    for (const group of analysis.groups) {
      const count = group.hunks.filter((hunk) => !hunk.inScope && !hunk.approved).length;
      if (count > 0) {
        const noun = count === 1 ? 'hunk' : 'hunks';
        reasons.push({
          kind: 'out_of_scope',
          message: `${group.domain}: ${count} out-of-scope ${noun} not approved`,
        });
      }
    }
  }

  return { blocked: reasons.length > 0, reasons };
}
