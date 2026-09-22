import type { Domain, Session } from './types.js';

/** Creates .scope/session.json pinned to the current HEAD. */
export async function startSession(
  cwd: string,
  task: string,
  allow: Session['allow']
): Promise<Session> {
  throw new Error('not implemented');
}

export function loadSession(cwd: string): Session | null {
  throw new Error('not implemented');
}

export function saveSession(cwd: string, session: Session): void {
  throw new Error('not implemented');
}

export function approveHunk(cwd: string, hunkId: string): void {
  throw new Error('not implemented');
}
