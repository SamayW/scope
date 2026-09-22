import type { Domain, Group, Hunk } from './types.js';

/** Assigns a domain to a hunk. Path rules first, content rules as fallback. */
export function classifyHunk(hunk: Hunk): Domain {
  throw new Error('not implemented');
}

/** Buckets hunks into one group per domain. */
export function groupHunks(hunks: Hunk[]): Group[] {
  throw new Error('not implemented');
}
