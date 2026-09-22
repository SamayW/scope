import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
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

  // A clone carries the source's local branches but not its remote-tracking
  // refs, so cloning a freshly cloned demo repo loses the demo branches. Pull
  // each one across when the plain clone did not bring it.
  for (const branch of ['demo-base', 'demo-agent']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '-q', `refs/heads/${branch}`], {
        cwd: dir,
        stdio: 'pipe',
      });
    } catch {
      execFileSync(
        'git',
        ['fetch', '-q', demo, `refs/remotes/origin/${branch}:refs/heads/${branch}`],
        { cwd: dir, stdio: 'pipe' }
      );
    }
  }

  // Without the dependencies the checks would try to fetch packages through
  // npx and time out, which says nothing about the extension.
  symlinkSync(join(demo, 'node_modules'), join(dir, 'node_modules'));
  git('checkout', '-q', '-B', 'run', 'demo-base');

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
    // Use a locally installed VS Code when there is one, otherwise let the
    // harness download a build. Hardcoding the macOS path made this suite
    // unrunnable anywhere else.
    const localVsCode = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';

    await runTests({
      ...(existsSync(localVsCode) ? { vscodeExecutablePath: localVsCode } : {}),
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspace,
        // its own profile, otherwise VS Code refuses to start a second
        // instance while one is already open and fails in claimInstance
        '--user-data-dir',
        join(workspace, '.vscode-user-data'),
        '--disable-extensions',
        '--disable-workspace-trust',
        '--disable-gpu',
      ],
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
