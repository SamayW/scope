import type { Domain, Hunk, Session } from './types.js';

/** No session means everything is in scope. Pure. */
export function isInScope(hunk: Hunk, domain: Domain, session: Session | null): boolean {
  throw new Error('not implemented');
}
