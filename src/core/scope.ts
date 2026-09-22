import type { Group, Hunk, Session } from './types.js';

/** True when the hunk matches an allowed glob or an allowed domain. */
export function matchScope(hunk: Hunk, session: Session): boolean {
  throw new Error('not implemented');
}

/** Marks every hunk and group in or out of scope for the session. */
export function applyScope(groups: Group[], session: Session): Group[] {
  throw new Error('not implemented');
}
