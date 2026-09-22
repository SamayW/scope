/** Reads raw diffs out of git. The only module here that shells out. */

/** SHA of the current HEAD. */
export async function getHeadSha(cwd: string): Promise<string> {
  throw new Error('not implemented');
}

/** Tracked changes against the baseline, plus untracked files, as one diff string. */
export async function getRawDiff(cwd: string, baseline: string): Promise<string> {
  throw new Error('not implemented');
}
