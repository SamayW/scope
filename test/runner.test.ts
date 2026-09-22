import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { runChecks, attachResults } from '../src/core/runner.js';
import type { Analysis, Check, CheckResult, Domain } from '../src/core/types.js';

const CWD = resolve(__dirname, '..');

function check(over: Partial<Check> = {}): Check {
  return {
    id: 'probe',
    label: 'probe',
    command: 'node',
    args: ['-e', 'process.exit(0)'],
    domains: 'any',
    timeoutMs: 10_000,
    ...over,
  };
}

describe('runChecks', () => {
  it('reports a clean command as pass', async () => {
    const [result] = await runChecks([check()], CWD);
    expect(result.status).toBe('pass');
    expect(result.exitCode).toBe(0);
    expect(result.label).toBe('probe');
  });

  it('reports a non-zero exit as fail and keeps the exit code', async () => {
    const [result] = await runChecks([check({ args: ['-e', 'process.exit(3)'] })], CWD);
    expect(result.status).toBe('fail');
    expect(result.exitCode).toBe(3);
  });

  it('reports a slow command as timeout, not fail', async () => {
    const slow = check({ args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 300 });
    const [result] = await runChecks([slow], CWD);
    expect(result.status).toBe('timeout');
  });

  it('does not throw when the command does not exist', async () => {
    const missing = check({ command: 'definitely-not-a-real-binary-xyz' });
    const [result] = await runChecks([missing], CWD);
    expect(result.status).toBe('fail');
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('captures stdout and stderr together', async () => {
    const noisy = check({
      args: ['-e', 'console.log("to stdout"); console.error("to stderr")'],
    });
    const [result] = await runChecks([noisy], CWD);
    expect(result.output).toContain('to stdout');
    expect(result.output).toContain('to stderr');
  });

  it('keeps only the last 50 output lines', async () => {
    const chatty = check({
      args: ['-e', 'for (let i = 1; i <= 200; i++) console.log("line " + i)'],
    });
    const [result] = await runChecks([chatty], CWD);
    const lines = result.output.split('\n');

    expect(lines.length).toBeLessThanOrEqual(50);
    // the tail is what matters: compilers put the summary last
    expect(result.output).toContain('line 200');
    expect(result.output).not.toContain('line 1\n');
  });

  it('records a duration', async () => {
    const [result] = await runChecks([check()], CWD);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fires onResult once per check as each lands', async () => {
    const seen: string[] = [];
    const results = await runChecks(
      [
        check({ id: 'fast', args: ['-e', 'process.exit(0)'] }),
        check({ id: 'slow', args: ['-e', 'setTimeout(() => process.exit(0), 250)'] }),
      ],
      CWD,
      (r) => seen.push(r.checkId)
    );

    expect(results.length).toBe(2);
    expect(seen.sort()).toEqual(['fast', 'slow']);
    // the quick one must not wait for the slow one
    expect(seen[0]).toBe('fast');
  });

  it('runs in parallel rather than one after another', async () => {
    const started = Date.now();
    await runChecks(
      [
        check({ id: 'a', args: ['-e', 'setTimeout(() => {}, 400)'] }),
        check({ id: 'b', args: ['-e', 'setTimeout(() => {}, 400)'] }),
        check({ id: 'c', args: ['-e', 'setTimeout(() => {}, 400)'] }),
      ],
      CWD
    );
    // three 400ms commands in series would be 1200ms
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('returns an empty list for no checks', async () => {
    expect(await runChecks([], CWD)).toEqual([]);
  });
});

describe('attachResults', () => {
  const analysis = (domains: Domain[]): Analysis => ({
    session: null,
    changedFiles: [],
    groups: domains.map((domain) => ({
      domain,
      risk: 'low' as const,
      score: 0,
      outOfScope: false,
      hunks: [],
      checks: [],
    })),
  });

  const result = (checkId: string): CheckResult => ({
    checkId,
    label: checkId,
    status: 'pass',
    exitCode: 0,
    durationMs: 1,
    output: '',
  });

  it('attaches an any check to every group', () => {
    const attached = attachResults(analysis(['ui', 'db']), [result('tsc')], [
      check({ id: 'tsc', domains: 'any' }),
    ]);
    expect(attached.groups.every((g) => g.checks.map((c) => c.checkId).includes('tsc'))).toBe(true);
  });

  it('attaches a scoped check only to its domain', () => {
    const attached = attachResults(analysis(['ui', 'db']), [result('prisma')], [
      check({ id: 'prisma', domains: ['db'] }),
    ]);
    expect(attached.groups.find((g) => g.domain === 'db')!.checks.length).toBe(1);
    expect(attached.groups.find((g) => g.domain === 'ui')!.checks.length).toBe(0);
  });

  it('ignores a result with no matching check', () => {
    const attached = attachResults(analysis(['ui']), [result('ghost')], []);
    expect(attached.groups[0].checks).toEqual([]);
  });

  it('does not mutate the input analysis', () => {
    const original = analysis(['ui']);
    attachResults(original, [result('tsc')], [check({ id: 'tsc', domains: 'any' })]);
    expect(original.groups[0].checks).toEqual([]);
  });
});
