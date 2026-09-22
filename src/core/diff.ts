import type { Hunk } from './types.js';

/** Returns the unified diff between the baseline commit and the working tree, including untracked files. */
export async function getDiff(repoRoot: string, baseline: string): Promise<string> {
  throw new Error('not implemented');
}

/** Parses a unified diff into hunks with stable ids. */
export function parseHunks(patch: string): Hunk[] {
  throw new Error('not implemented');
}
