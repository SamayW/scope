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

export const hasDemoRepo = existsSync(resolve(DEMO_REPO, '.git'));
