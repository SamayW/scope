import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeadSha } from './git.js';
import type { Session } from './types.js';

const SESSION_DIR = '.scope';
const SESSION_FILE = 'session.json';

const sessionPath = (cwd: string) => join(cwd, SESSION_DIR, SESSION_FILE);

/** Adds .scope/ to .gitignore so session state never gets committed. */
function ensureGitignored(cwd: string): void {
  const gitignore = join(cwd, '.gitignore');
  const current = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';

  const alreadyListed = current
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line === '.scope/' || line === '.scope');

  if (alreadyListed) {
    return;
  }

  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  appendFileSync(gitignore, `${separator}.scope/\n`);
}

/** Pins the baseline to the current HEAD and writes .scope/session.json. */
export async function startSession(
  cwd: string,
  task: string,
  allow: Session['allow']
): Promise<Session> {
  const session: Session = {
    task,
    baseline: await getHeadSha(cwd),
    allow: {
      globs: allow.globs ?? [],
      domains: allow.domains ?? [],
    },
    approved: [],
    createdAt: new Date().toISOString(),
  };

  ensureGitignored(cwd);
  saveSession(cwd, session);
  return session;
}

export function loadSession(cwd: string): Session | null {
  const path = sessionPath(cwd);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Session;
  } catch {
    // a corrupt session file should not take the whole gate down
    return null;
  }
}

export function saveSession(cwd: string, session: Session): void {
  mkdirSync(join(cwd, SESSION_DIR), { recursive: true });
  writeFileSync(sessionPath(cwd), `${JSON.stringify(session, null, 2)}\n`);
}

export function approveHunk(cwd: string, hunkId: string): void {
  const session = loadSession(cwd);
  if (!session) {
    throw new Error('No active session. Run `scope start "<task>"` first.');
  }

  if (!session.approved.includes(hunkId)) {
    session.approved.push(hunkId);
    saveSession(cwd, session);
  }
}
