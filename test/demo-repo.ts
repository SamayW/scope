import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Several suites exercise the engine against the real demo repository, which
 * lives beside this one. Clone it as a sibling to run them:
 *
 *   git clone https://github.com/SamayW/scope-demo.git ../scope-demo
 *
 * Without it those suites skip rather than fail, so a fresh clone of this
 * repository on its own still reports a clean run.
 */
export const DEMO_REPO = resolve(__dirname, '../../scope-demo');

/** The branches the demo scenario is built from. */
const BRANCHES = ['demo-base', 'demo-agent', 'base', 'agent'];

function resolves(cwd: string, ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '-q', `${ref}^{commit}`], {
      cwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export const hasDemoRepo =
  existsSync(resolve(DEMO_REPO, '.git')) &&
  BRANCHES.every((b) => resolves(DEMO_REPO, b) || resolves(DEMO_REPO, `origin/${b}`));

/**
 * Clones the demo repo for a test to mutate freely.
 *
 * `git clone` copies the source's local branches but not its remote-tracking
 * refs, so cloning a repository that was itself freshly cloned leaves the demo
 * branches behind entirely. Each one is pulled across explicitly when the plain
 * clone did not bring it.
 */
export function cloneDemo(dest: string): void {
  execFileSync('git', ['clone', '-q', DEMO_REPO, dest], { stdio: 'pipe' });

  for (const branch of BRANCHES) {
    if (resolves(dest, `refs/heads/${branch}`)) {
      continue;
    }
    try {
      execFileSync(
        'git',
        ['fetch', '-q', DEMO_REPO, `refs/remotes/origin/${branch}:refs/heads/${branch}`],
        { cwd: dest, stdio: 'pipe' }
      );
    } catch {
      // nothing more to try; hasDemoRepo will have skipped the suite already
    }
  }
}
