#!/usr/bin/env node
/**
 * Stages the demo scenario. Cross platform on purpose: this used to be three
 * bash scripts, which npm runs through cmd.exe on Windows where bash may not
 * exist at all.
 *
 *   node scripts/demo.js          clean baseline, session, agent commit
 *   node scripts/demo.js reset    clean baseline and session only
 *   node scripts/demo.js agent    apply the agent commit
 */
const { execFileSync } = require('node:child_process');
const { existsSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

const SCOPE = resolve(__dirname, '..');
const DEMO = resolve(SCOPE, '..', 'scope-demo');
const CLI = join(SCOPE, 'out', 'cli.js');

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: DEMO, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function quiet(args) {
  try {
    git(args);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function check() {
  if (!existsSync(join(DEMO, '.git'))) {
    fail(
      `The demo repository is missing.\n` +
        `Expected it beside this one, at:\n  ${DEMO}\n\n` +
        `Clone it with:\n  git clone https://github.com/SamayW/scope-demo.git "${DEMO}"`
    );
  }
  if (!existsSync(CLI)) {
    fail(`Nothing is built yet. Run:\n  npm install && npm run compile`);
  }
}

/** A fresh clone has the demo branches only as origin/*, so accept either. */
function ref(name) {
  if (quiet(['rev-parse', '--verify', '-q', `refs/heads/${name}`])) {
    return name;
  }
  if (quiet(['rev-parse', '--verify', '-q', `refs/remotes/origin/${name}`])) {
    return `origin/${name}`;
  }
  fail(
    `The demo repository has no branch "${name}".\n` +
      `Re-clone it:\n  git clone https://github.com/SamayW/scope-demo.git "${DEMO}"`
  );
}

function reset() {
  check();
  const base = ref('demo-base');

  quiet(['cherry-pick', '--abort']);
  git(['checkout', '-q', '-B', 'demo', base]);
  git(['reset', '-q', '--hard', base]);
  quiet(['clean', '-qfd', '-e', 'node_modules']);
  rmSync(join(DEMO, '.scope'), { recursive: true, force: true });

  execFileSync(
    process.execPath,
    [CLI, 'start', 'add signup form validation', '--allow', 'src/app/signup/*.tsx'],
    { cwd: DEMO, stdio: 'inherit' }
  );
}

function agent() {
  check();
  quiet(['cherry-pick', '--abort']);

  if (git(['log', '--format=%s', '-1']).startsWith('agent: ')) {
    console.log('The agent move is already applied, so there is nothing to do.');
    console.log("Run 'npm run demo' to replay it from the start.");
    return;
  }

  if (!quiet(['cherry-pick', ref('demo-agent')])) {
    quiet(['cherry-pick', '--abort']);
    fail("Could not apply the agent commit. Run 'npm run demo' and try again.");
  }
}

const mode = process.argv[2] ?? 'all';

if (mode === 'reset') {
  reset();
} else if (mode === 'agent') {
  agent();
  console.log('Agent commit applied. Refresh the Scope sidebar.');
} else {
  reset();
  agent();
  console.log('');
  console.log('Demo is staged.');
  console.log(`  repo:   ${DEMO}`);
  console.log(`  branch: ${git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()}`);
  console.log('  task:   add signup form validation');
  console.log('  scope:  src/app/signup/*.tsx');
  console.log('');
  console.log('Refresh the Scope sidebar. Expect BLOCKED with auth, tests and db out of scope.');
}
