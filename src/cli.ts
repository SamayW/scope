#!/usr/bin/env node
import { Command } from 'commander';
import { analyze } from './core/analyze.js';
import { selectChecks, runChecks } from './core/checks.js';
import { evaluateGate } from './core/gate.js';
import { detectStack } from './core/stack.js';
import type { Stack } from './core/types.js';

const program = new Command();

program.name('scope').description('Local pre-push gate for AI-agent changes').version('0.0.1');

program
  .command('start')
  .description('Record the baseline commit and declare the allowed scope')
  .argument('<task>', 'what the agent was asked to do')
  .option('-a, --allow <glob...>', 'allowed path globs')
  .action((task: string, options: { allow?: string[] }) => {
    console.log(`scope start: ${task}`);
    console.log(`allowed: ${(options.allow ?? []).join(', ') || '(none yet)'}`);
    console.log('Not implemented in M0. startSession lands in M1.');
  });

program
  .command('check')
  .description('Analyze the diff, run scoped checks, and apply the gate')
  .action(async () => {
    const analysis = await analyze(process.cwd());

    console.log(`task: ${analysis.session.task}`);
    console.log(`scope: ${analysis.session.allowGlobs.join(', ')}`);
    console.log('');
    console.log(`${analysis.groups.length} groups`);

    for (const group of analysis.groups) {
      const scope = group.inScope ? 'in scope' : 'OUT OF SCOPE';
      console.log(`  ${group.domain.padEnd(7)} ${group.risk.padEnd(6)} ${scope}`);
    }

    // detectStack still throws in M0, so the stub check list is used directly.
    let stack: Stack;
    try {
      stack = detectStack(process.cwd());
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

    const checks = selectChecks(analysis.groups, stack);
    const results = await runChecks(checks, process.cwd());

    console.log('');
    for (const result of results) {
      console.log(`  ${result.status.toUpperCase().padEnd(5)} ${result.checkId}`);
    }

    const gate = evaluateGate(analysis.groups, results, analysis.session);

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
  .description('Approve an out-of-scope group or hunk')
  .argument('<id>', 'group domain or hunk id')
  .action((id: string) => {
    console.log(`scope approve: ${id}`);
    console.log('Not implemented in M0. Approvals land in M1.');
  });

program.parse();
