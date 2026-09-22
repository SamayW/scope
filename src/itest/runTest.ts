import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, appendFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

/**
 * Builds a throwaway workspace in the demo's "agent has just worked" state, so
 * the extension has something real to analyze when it activates.
 */
function buildWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'scope-itest-'));
  const demo = resolve(__dirname, '../../../scope-demo');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });

  execFileSync('git', ['clone', '-q', demo, dir], { stdio: 'pipe' });

  // Without the dependencies the checks would try to fetch packages through
  // npx and time out, which says nothing about the extension.
  symlinkSync(join(demo, 'node_modules'), join(dir, 'node_modules'));
  git('checkout', '-q', '-b', 'demo-agent', 'origin/demo-agent');
  git('checkout', '-q', '-B', 'run', 'origin/demo-base');

  const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
  }).trim();

  appendFileSync(join(dir, '.gitignore'), '.scope/\nnode_modules\n');
  git('add', '-A');
  git('-c', 'user.name=T', '-c', 'user.email=t@e.com', 'commit', '-q', '-m', 'configure');
  git('cherry-pick', 'demo-agent');

  mkdirSync(join(dir, '.scope'), { recursive: true });
  writeFileSync(
    join(dir, '.scope', 'session.json'),
    JSON.stringify({
      task: 'add signup form validation',
      baseline,
      allow: { globs: ['src/app/signup/*.tsx'], domains: [] },
      approved: [],
      createdAt: new Date().toISOString(),
    })
  );

  return dir;
}

async function main(): Promise<void> {
  // SCOPE_ITEST_TARGET lets the same suite run against the packaged and
  // installed copy, which is what people actually get, rather than the source
  // tree with node_modules sitting beside it.
  const extensionDevelopmentPath = process.env.SCOPE_ITEST_TARGET ?? resolve(__dirname, '../../');
  console.log(`testing extension at: ${extensionDevelopmentPath}`);
  const extensionTestsPath = resolve(__dirname, './suite/index');
  const workspace = buildWorkspace();

  try {
    await runTests({
      // use the installed VS Code rather than downloading a second copy
      vscodeExecutablePath: '/Applications/Visual Studio Code.app/Contents/MacOS/Code',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, '--disable-extensions', '--disable-gpu'],
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
