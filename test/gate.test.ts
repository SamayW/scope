import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy, evaluateGate, DEFAULT_POLICY } from '../src/core/gate.js';
import type {
  Analysis,
  CheckResult,
  ClassifiedHunk,
  Domain,
  FlagId,
  Policy,
} from '../src/core/types.js';

function hunk(over: Partial<ClassifiedHunk> = {}): ClassifiedHunk {
  return {
    id: 'x#0',
    file: 'src/thing.ts',
    fileStatus: 'modified',
    added: [],
    removed: [],
    patch: '',
    domain: 'other',
    flags: [],
    score: 0,
    inScope: true,
    approved: false,
    ...over,
  };
}

function flag(id: FlagId, message = 'something happened', points = 5) {
  return { id, message, points };
}

function analysis(hunks: ClassifiedHunk[]): Analysis {
  const domains = [...new Set(hunks.map((h) => h.domain))];
  return {
    session: null,
    changedFiles: [...new Set(hunks.map((h) => h.file))],
    groups: domains.map((domain: Domain) => ({
      domain,
      risk: 'low' as const,
      score: 0,
      outOfScope: hunks.some((h) => h.domain === domain && !h.inScope && !h.approved),
      hunks: hunks.filter((h) => h.domain === domain),
      checks: [],
    })),
  };
}

function result(over: Partial<CheckResult> = {}): CheckResult {
  return {
    checkId: 'tsc',
    label: 'tsc --noEmit',
    status: 'pass',
    exitCode: 0,
    durationMs: 10,
    output: '',
    ...over,
  };
}

describe('loadPolicy', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'scope-policy-'));
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('defaults to blocking on everything', () => {
    expect(loadPolicy(repo)).toEqual(DEFAULT_POLICY);
    expect(DEFAULT_POLICY.blockOn).toEqual([
      'failing_checks',
      'deleted_tests',
      'secrets',
      'out_of_scope',
    ]);
  });

  it('reads block_on from .scope.yml', () => {
    writeFileSync(join(repo, '.scope.yml'), 'block_on: [deleted_tests, secrets]\n');
    expect(loadPolicy(repo).blockOn).toEqual(['deleted_tests', 'secrets']);
  });

  it('accepts the camelCase spelling too', () => {
    writeFileSync(join(repo, '.scope.yml'), 'blockOn: [secrets]\n');
    expect(loadPolicy(repo).blockOn).toEqual(['secrets']);
  });

  it('reads per-domain command overrides', () => {
    writeFileSync(join(repo, '.scope.yml'), 'groups:\n  db: ["npm run db:check"]\n');
    expect(loadPolicy(repo).groups).toEqual({ db: ['npm run db:check'] });
  });

  it('drops unknown rule names rather than trusting them', () => {
    writeFileSync(join(repo, '.scope.yml'), 'block_on: [secrets, nonsense]\n');
    expect(loadPolicy(repo).blockOn).toEqual(['secrets']);
  });

  it('falls back to the default when the file is malformed', () => {
    // A broken config must not silently disable the gate.
    writeFileSync(join(repo, '.scope.yml'), 'block_on: [unclosed\n  : :\n');
    expect(loadPolicy(repo)).toEqual(DEFAULT_POLICY);
  });

  it('falls back to the default when block_on is empty', () => {
    writeFileSync(join(repo, '.scope.yml'), 'block_on: []\n');
    expect(loadPolicy(repo).blockOn).toEqual(DEFAULT_POLICY.blockOn);
  });
});

describe('evaluateGate', () => {
  const all = DEFAULT_POLICY;

  it('allows a clean run', () => {
    const gate = evaluateGate(analysis([hunk()]), [result()], all);
    expect(gate.blocked).toBe(false);
    expect(gate.reasons).toEqual([]);
  });

  it('blocks on a failing check', () => {
    const gate = evaluateGate(
      analysis([hunk()]),
      [result({ checkId: 'prisma-validate', label: 'prisma validate', status: 'fail' })],
      all
    );
    expect(gate.blocked).toBe(true);
    expect(gate.reasons[0]).toEqual({
      kind: 'failing_checks',
      message: 'Check failed: prisma validate',
    });
  });

  it('distinguishes a timeout from a failure', () => {
    const gate = evaluateGate(analysis([hunk()]), [result({ status: 'timeout' })], all);
    expect(gate.reasons[0].message).toBe('Check timed out: tsc --noEmit');
  });

  it('ignores passed and skipped checks', () => {
    const gate = evaluateGate(
      analysis([hunk()]),
      [result({ status: 'pass' }), result({ status: 'skip' })],
      all
    );
    expect(gate.blocked).toBe(false);
  });

  it('blocks on a deleted test', () => {
    const gate = evaluateGate(
      analysis([
        hunk({
          domain: 'tests',
          file: 'src/a.test.ts',
          flags: [flag('deleted-test', 'Test file deleted')],
        }),
      ]),
      [],
      all
    );
    expect(gate.reasons).toContainEqual({
      kind: 'deleted_tests',
      message: 'Test file deleted: src/a.test.ts',
    });
  });

  it('blocks on a skipped test', () => {
    const gate = evaluateGate(
      analysis([hunk({ domain: 'tests', flags: [flag('skip-only', 'Test skipped')] })]),
      [],
      all
    );
    expect(gate.reasons.some((r) => r.kind === 'deleted_tests')).toBe(true);
  });

  it('respects approval for deleted tests', () => {
    const gate = evaluateGate(
      analysis([hunk({ domain: 'tests', approved: true, flags: [flag('deleted-test')] })]),
      [],
      all
    );
    expect(gate.reasons.some((r) => r.kind === 'deleted_tests')).toBe(false);
  });

  it('blocks on a secret even when the hunk is approved', () => {
    // Approving a hunk is a judgement about scope, not permission to commit
    // a credential.
    const gate = evaluateGate(
      analysis([
        hunk({ file: 'src/page.tsx', approved: true, inScope: true, flags: [flag('secret')] }),
      ]),
      [],
      all
    );
    expect(gate.blocked).toBe(true);
    expect(gate.reasons).toContainEqual({
      kind: 'secrets',
      message: 'Possible secret in src/page.tsx',
    });
  });

  it('blocks on unapproved out-of-scope hunks and counts them per domain', () => {
    const gate = evaluateGate(
      analysis([
        hunk({ id: 'a#0', domain: 'auth', file: 'src/middleware.ts', inScope: false }),
        hunk({ id: 'b#0', domain: 'auth', file: 'src/auth.ts', inScope: false }),
        hunk({ id: 'c#0', domain: 'db', file: 'schema.prisma', inScope: false }),
      ]),
      [],
      all
    );
    expect(gate.reasons).toContainEqual({
      kind: 'out_of_scope',
      message: 'auth: 2 out-of-scope hunks not approved',
    });
    expect(gate.reasons).toContainEqual({
      kind: 'out_of_scope',
      message: 'db: 1 out-of-scope hunk not approved',
    });
  });

  it('stops reporting out-of-scope once approved', () => {
    const gate = evaluateGate(
      analysis([hunk({ domain: 'auth', inScope: false, approved: true })]),
      [],
      all
    );
    expect(gate.blocked).toBe(false);
  });

  it('only applies the rules the policy enables', () => {
    const onlySecrets: Policy = { blockOn: ['secrets'] };
    const subject = analysis([
      hunk({ domain: 'tests', inScope: false, flags: [flag('deleted-test')] }),
    ]);

    expect(evaluateGate(subject, [result({ status: 'fail' })], onlySecrets).blocked).toBe(false);
    expect(evaluateGate(subject, [result({ status: 'fail' })], DEFAULT_POLICY).blocked).toBe(true);
  });

  it('reports every issue rather than stopping at the first', () => {
    const gate = evaluateGate(
      analysis([
        hunk({ id: 'a#0', domain: 'tests', inScope: false, flags: [flag('deleted-test')] }),
        hunk({ id: 'b#0', domain: 'ui', flags: [flag('secret')] }),
      ]),
      [result({ status: 'fail' })],
      all
    );
    expect(new Set(gate.reasons.map((r) => r.kind))).toEqual(
      new Set(['failing_checks', 'deleted_tests', 'secrets', 'out_of_scope'])
    );
  });
});
