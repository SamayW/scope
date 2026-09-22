import execa from 'execa';
import { simpleGit } from 'simple-git';

/**
 * Scope's own session state. Never analyze it: startSession gitignores the
 * folder, but a repo that has not run `scope start` yet would otherwise see
 * session.json as an untracked file and, because the path contains "session",
 * classify it as an auth change.
 */
export const SCOPE_STATE_PREFIX = '.scope/';

/** False for a folder git knows nothing about. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await simpleGit(cwd).revparse(['--git-dir']);
    return true;
  } catch {
    return false;
  }
}

/** SHA of the current HEAD. */
export async function getHeadSha(cwd: string): Promise<string> {
  const sha = await simpleGit(cwd).revparse(['HEAD']);
  return sha.trim();
}

/** Absolute path to the repository root, so the CLI works from any subfolder. */
export async function getRepoRoot(cwd: string): Promise<string> {
  const root = await simpleGit(cwd).revparse(['--show-toplevel']);
  return root.trim();
}

/**
 * Tracked changes against the baseline plus untracked files, concatenated
 * into a single diff string.
 */
export async function getRawDiff(cwd: string, baseline: string): Promise<string> {
  const git = simpleGit(cwd);
  const parts: string[] = [];

  const tracked = await git.diff([baseline]);
  if (tracked.trim()) {
    parts.push(tracked.trimEnd());
  }

  const listed = await git.raw(['ls-files', '--others', '--exclude-standard']);
  const untracked = listed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith(SCOPE_STATE_PREFIX));

  for (const file of untracked) {
    // `git diff --no-index` exits 1 when the files differ, which is the normal
    // case here. simple-git raises that as an error, so use execa and ignore
    // the exit code.
    const result = await execa('git', ['diff', '--no-index', '--', '/dev/null', file], {
      cwd,
      reject: false,
    });
    if (result.stdout.trim()) {
      parts.push(result.stdout.trimEnd());
    }
  }

  return parts.length > 0 ? parts.join('\n') + '\n' : '';
}

/**
 * Baseline to use when no session is active: the fork point from the remote
 * tracking branch if there is one, else the previous commit.
 */
export async function getFallbackBaseline(cwd: string): Promise<string> {
  const git = simpleGit(cwd);

  try {
    const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    const remotes = await git.getRemotes();
    if (remotes.length > 0 && branch && branch !== 'HEAD') {
      const base = await git.raw(['merge-base', 'HEAD', `${remotes[0].name}/${branch}`]);
      if (base.trim()) {
        return base.trim();
      }
    }
  } catch {
    // no remote, or no tracking branch: fall through
  }

  try {
    return (await git.revparse(['HEAD~1'])).trim();
  } catch {
    // first commit in the repo: diff against the empty tree
    return (await git.raw(['hash-object', '-t', 'tree', '/dev/null'])).trim();
  }
}
