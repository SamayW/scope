import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { startSession, loadSession, saveSession, approveHunk } from '../src/core/session.js';

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'scope-session-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
  writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: repo });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('startSession', () => {
  it('pins the baseline to the current HEAD', async () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    const session = await startSession(repo, 'add signup validation', {
      globs: ['src/app/signup/**'],
      domains: ['ui'],
    });
    expect(session.baseline).toBe(head);
    expect(session.task).toBe('add signup validation');
    expect(session.approved).toEqual([]);
  });

  it('writes .scope/session.json', async () => {
    await startSession(repo, 'task', { globs: [], domains: [] });
    expect(existsSync(join(repo, '.scope', 'session.json'))).toBe(true);
  });

  it('makes .scope/ ignore itself instead of editing the repo gitignore', async () => {
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n');
    await startSession(repo, 'task', { globs: [], domains: [] });

    // the self-ignoring directory keeps session state out of git
    expect(readFileSync(join(repo, '.scope', '.gitignore'), 'utf8').trim()).toBe('*');

    // and the repo's own gitignore is left exactly as it was, so Scope does
    // not report its own setup as a change in the next analysis
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('node_modules/\n');
  });

  it('leaves the working tree clean after starting a session', async () => {
    // beforeEach already committed everything, so the tree starts clean
    await startSession(repo, 'task', { globs: [], domains: [] });

    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim();
    expect(status).toBe('');
  });
});

describe('loadSession', () => {
  it('returns null when there is no session', () => {
    expect(loadSession(repo)).toBeNull();
  });

  it('round-trips through save', async () => {
    const written = await startSession(repo, 'task', { globs: ['a/**'], domains: ['ui'] });
    expect(loadSession(repo)).toEqual(written);
  });

  it('returns null rather than throwing on a corrupt file', async () => {
    await startSession(repo, 'task', { globs: [], domains: [] });
    writeFileSync(join(repo, '.scope', 'session.json'), '{ not json');
    expect(loadSession(repo)).toBeNull();
  });
});

describe('approveHunk', () => {
  it('records the approval', async () => {
    await startSession(repo, 'task', { globs: [], domains: [] });
    approveHunk(repo, 'src/middleware.ts#0');
    expect(loadSession(repo)!.approved).toEqual(['src/middleware.ts#0']);
  });

  it('is idempotent', async () => {
    await startSession(repo, 'task', { globs: [], domains: [] });
    approveHunk(repo, 'a#0');
    approveHunk(repo, 'a#0');
    expect(loadSession(repo)!.approved).toEqual(['a#0']);
  });

  it('throws a useful message with no session', () => {
    expect(() => approveHunk(repo, 'a#0')).toThrow(/scope start/);
  });
});

describe('saveSession', () => {
  it('creates the directory if it is missing', () => {
    saveSession(repo, {
      task: 't',
      baseline: 'abc',
      allow: { globs: [], domains: [] },
      approved: [],
      createdAt: new Date().toISOString(),
    });
    expect(existsSync(join(repo, '.scope', 'session.json'))).toBe(true);
  });
});
