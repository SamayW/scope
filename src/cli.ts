#!/usr/bin/env node
import { resolve } from 'node:path';
import { Command } from 'commander';
import { analyze } from './core/analyze.js';
import { selectChecks, runChecks } from './core/checks.js';
import { loadPolicy, evaluateGate } from './core/gate.js';
import { getRepoRoot } from './core/git.js';
import { detectStack } from './core/stack.js';
import { approveHunk, startSession } from './core/session.js';
import { installHook } from './hook.js';
import type { Analysis, CheckResult, Domain, GateResult, RiskLevel, Stack } from './core/types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

const RISK_COLOR: Record<RiskLevel, string> = {
  high: RED,
  medium: YELLOW,
  low: GREEN,
};

/** Everything runs from the repository root, so the CLI works in any subfolder. */
async function repoRoot(): Promise<string> {
  try {
    return await getRepoRoot(process.cwd());
  } catch {
    console.error(`${RED}Not a git repository.${RESET}`);
    process.exit(2);
  }
}

function printAnalysis(analysis: Analysis): void {
  if (analysis.session) {
    console.log(`${DIM}task:${RESET}  ${analysis.session.task}`);
    console.log(`${DIM}scope:${RESET} ${analysis.session.allow.globs.join(', ') || '(none)'}`);
  } else {
    console.log(`${DIM}no active session, everything counts as in scope${RESET}`);
  }
  console.log('');

  if (analysis.groups.length === 0) {
    console.log(`${GREEN}No changes against the baseline.${RESET}`);
    return;
  }

  for (const group of analysis.groups) {
    const color = RISK_COLOR[group.risk];
    const scope = group.outOfScope ? ` ${RED}(out of scope)${RESET}` : '';
    console.log(
      `${color}${BOLD}[${group.risk.toUpperCase()}]${RESET} ${group.domain}${scope} ${DIM}${group.hunks.length} hunk${group.hunks.length === 1 ? '' : 's'}${RESET}`
    );

    for (const hunk of group.hunks) {
      for (const flag of hunk.flags) {
        console.log(`    ${color}-${RESET} ${flag.message} ${DIM}(${hunk.file})${RESET}`);
      }
    }
  }
}

function printChecks(results: CheckResult[]): void {
  if (results.length === 0) {
    return;
  }
  console.log('');
  for (const result of results) {
    const passed = result.status === 'pass' || result.status === 'skip';
    const color = passed ? GREEN : RED;
    console.log(`  ${color}${result.status.toUpperCase().padEnd(5)}${RESET} ${result.label}`);
  }
}

function printGate(gate: GateResult): void {
  console.log('');
  if (!gate.blocked) {
    console.log(`${GREEN}${BOLD}OK${RESET}`);
    return;
  }

  console.log(`${RED}${BOLD}BLOCKED${RESET}`);
  for (const reason of gate.reasons) {
    console.log(`  ${RED}-${RESET} ${reason.message}`);
  }
}

const program = new Command();

program.name('scope').description('Local pre-push gate for AI-agent changes').version('0.0.1');

program
  .command('start')
  .description('Record the baseline commit and declare the allowed scope')
  .argument('<task>', 'what the agent was asked to do')
  .option('-a, --allow <glob...>', 'allowed path globs', [])
  .option('-d, --domain <domain...>', 'allowed domains', [])
  .action(async (task: string, options: { allow: string[]; domain: string[] }) => {
    const cwd = await repoRoot();
    const session = await startSession(cwd, task, {
      globs: options.allow,
      domains: options.domain as Domain[],
    });

    console.log(`${GREEN}Session started.${RESET}`);
    console.log(`${DIM}task:${RESET}     ${session.task}`);
    console.log(`${DIM}baseline:${RESET} ${session.baseline.slice(0, 8)}`);
    console.log(`${DIM}allow:${RESET}    ${session.allow.globs.join(', ') || '(none)'}`);
    if (session.allow.domains.length > 0) {
      console.log(`${DIM}domains:${RESET}  ${session.allow.domains.join(', ')}`);
    }
  });

program
  .command('check')
  .description('Analyze the diff, run scoped checks, and apply the gate')
  .action(async () => {
    const cwd = await repoRoot();
    const analysis = await analyze(cwd);
    const policy = loadPolicy(cwd);

    printAnalysis(analysis);

    // detectStack is Dev B's and still throws, so fall back for now.
    let stack: Stack;
    try {
      stack = detectStack(cwd);
    } catch {
      stack = {
        typescript: true,
        next: true,
        prisma: true,
        eslint: false,
        docker: false,
        testRunner: 'vitest',
        packageManager: 'npm',
      };
    }

    const checks = selectChecks(stack, analysis, policy);
    const results = await runChecks(checks, cwd);
    printChecks(results);

    const gate = evaluateGate(analysis, results, policy);
    printGate(gate);

    process.exit(gate.blocked ? 1 : 0);
  });

program
  .command('approve')
  .description('Approve an out-of-scope hunk so it stops blocking the push')
  .argument('<hunkId>', 'hunk id, for example src/middleware.ts#0')
  .action(async (hunkId: string) => {
    const cwd = await repoRoot();
    try {
      approveHunk(cwd, hunkId);
      console.log(`${GREEN}Approved${RESET} ${hunkId}`);
    } catch (error) {
      console.error(`${RED}${(error as Error).message}${RESET}`);
      process.exit(2);
    }
  });

program
  .command('install-hook')
  .description('Install the pre-push hook so the gate cannot be skipped')
  .action(async () => {
    const cwd = await repoRoot();
    const cliPath = resolve(__dirname, 'cli.js');
    const hookPath = installHook(cwd, cliPath);
    console.log(`${GREEN}Installed${RESET} ${hookPath}`);
  });

program.parse();
