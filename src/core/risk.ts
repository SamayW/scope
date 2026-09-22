import type { Flag, Group, Hunk, Risk } from './types.js';

/** Scores a single hunk and returns the flags that produced the score. */
export function scoreHunk(hunk: Hunk): { score: number; flags: Flag[] } {
  throw new Error('not implemented');
}

/** Sums hunk scores across a group and buckets the total into a risk level. */
export function scoreGroup(group: Group): { score: number; risk: Risk } {
  throw new Error('not implemented');
}
