import type { ClassifiedHunk, Group } from './types.js';

/** Buckets by domain, doubles unapproved out-of-scope scores, sorts by score desc. Pure. */
export function buildGroups(hunks: ClassifiedHunk[]): Group[] {
  throw new Error('not implemented');
}
