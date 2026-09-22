#!/usr/bin/env node
import { Command } from 'commander';
import { analyze } from './core/analyze.js';
import { selectChecks, runChecks } from './core/checks.js';
import { loadPolicy, evaluateGate } from './core/gate.js';
import { detectStack } from './core/stack.js';
import type { Stack } from './core/types.js';

const program = new Command();

program.name('scope').description('Local pre-push gate for AI-agent changes').version('0.0.1');

program
  .command('start')
  .description('Record the baseline commit and declare the allowed scope')
  .argument('<task>', 'what the agent was asked to do')
  .option('-a, --allow <glob...>', 'allowed path globs')
  .option('-d, --domain <domain...>', 'allowed domains')
  .action((task: string, options: { allow?: string[]; domain?: string[] }) => {
    console.log(`scope start: ${task}`);
    console.log(`allowed: ${(options.allow ?? []).join(', ') || '(none yet)'}`);
    console.log('Not implemented yet.');
  });

program
  .command('check')
  .description('Analyze the diff, run scoped checks, and apply the gate')
  .action(async () => {
    const cwd = process.cwd();
    const analysis = await analyze(cwd);
    const policy = loadPolicy(cwd);

    if (analysis.session) {
      console.log(`task: ${analysis.session.task}`);
      console.log(`scope: ${analysis.session.allow.globs.join(', ')}`);
      console.log('');
    }

    console.log(`${analysis.groups.length} groups`);
    for (const group of analysis.groups) {
      const scope = group.outOfScope ? 'OUT OF SCOPE' : 'in scope';
      console.log(`  ${group.domain.padEnd(7)} ${group.risk.padEnd(6)} ${scope}`);
    }

    // detectStack still throws, so fall back until Dev B lands it.
    let stack: Stack;
    try {
      stack = detectStack(cwd);
    } catch {
      stack = {
        typescript: true,
        next: true,
        prisma: true,
        vitest: true,
        jest: false,
        eslint: true,
        docker: false,
      };
    }

    const checks = selectChecks(stack, analysis, policy);
    const results = await runChecks(checks, cwd);

    console.log('');
    for (const result of results) {
      console.log(`  ${result.status.toUpperCase().padEnd(5)} ${result.label}`);
    }

    const gate = evaluateGate(analysis, results, policy);

    console.log('');
    console.log(gate.blocked ? 'BLOCKED' : 'OK');
    for (const reason of gate.reasons) {
      console.log(`  - ${reason.message}`);
    }

    if (gate.blocked) {
      process.exit(1);
    }
  });

program
  .command('approve')
  .description('Approve an out-of-scope hunk')
  .argument('<hunkId>', 'hunk id')
  .action((hunkId: string) => {
    console.log(`scope approve: ${hunkId}`);
    console.log('Not implemented yet.');
  });

program.parse();
