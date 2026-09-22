import { minimatch } from 'minimatch';
import type { Domain, Hunk, Session } from './types.js';

/**
 * A hunk is in scope when it matches an allowed glob or an allowed domain.
 * With no session there is nothing to be out of scope of. Pure.
 */
export function isInScope(hunk: Hunk, domain: Domain, session: Session | null): boolean {
  if (!session) {
    return true;
  }

  if (session.allow.domains.includes(domain)) {
    return true;
  }

  return session.allow.globs.some((glob) => minimatch(hunk.file, glob));
}
