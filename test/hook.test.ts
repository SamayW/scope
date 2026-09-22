import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { installHook } from '../src/hook.js';

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'scope-hook-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('installHook', () => {
  it('writes an executable pre-push hook', () => {
    const path = installHook(repo, '/opt/scope/out/cli.js');

    expect(path).toBe(join(repo, '.git', 'hooks', 'pre-push'));
    expect(readFileSync(path, 'utf8')).toBe(
      '#!/bin/sh\nnode "/opt/scope/out/cli.js" check || exit 1\n'
    );
    // owner execute bit
    expect(statSync(path).mode & 0o100).toBeTruthy();
  });

  it('backs up an existing hook rather than clobbering it', () => {
    const hookPath = join(repo, '.git', 'hooks', 'pre-push');
    mkdirSync(join(repo, '.git', 'hooks'), { recursive: true });
    writeFileSync(hookPath, '#!/bin/sh\necho someone elses hook\n');

    installHook(repo, '/opt/scope/out/cli.js');

    expect(readFileSync(`${hookPath}.bak`, 'utf8')).toContain('someone elses hook');
    expect(readFileSync(hookPath, 'utf8')).toContain('scope/out/cli.js');
  });

  it('creates the hooks directory when it is missing', () => {
    rmSync(join(repo, '.git', 'hooks'), { recursive: true, force: true });
    const path = installHook(repo, '/opt/scope/out/cli.js');
    expect(existsSync(path)).toBe(true);
  });

  it('quotes the cli path so a space does not break the hook', () => {
    const path = installHook(repo, '/Users/me/Desktop/42 abu dhabi/scope/out/cli.js');
    expect(readFileSync(path, 'utf8')).toContain('"/Users/me/Desktop/42 abu dhabi/scope/out/cli.js"');
  });
});
