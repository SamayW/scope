import type { Session } from './types.js';

/** Creates a session pinned to the current HEAD as baseline. */
export function startSession(repoRoot: string, task: string, allowGlobs: string[]): Session {
  throw new Error('not implemented');
}

/** Reads .scope/session.json, or null when no session is active. */
export function loadSession(repoRoot: string): Session | null {
  throw new Error('not implemented');
}

/** Writes .scope/session.json. */
export function saveSession(repoRoot: string, session: Session): void {
  throw new Error('not implemented');
}
