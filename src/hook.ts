import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes .git/hooks/pre-push so the gate runs on every push. This is the part
 * an agent cannot talk its way around: it is git that invokes it, not the
 * editor.
 */
export function installHook(repoRoot: string, cliPath: string): string {
  const hooksDir = join(repoRoot, '.git', 'hooks');
  const hookPath = join(hooksDir, 'pre-push');

  mkdirSync(hooksDir, { recursive: true });

  if (existsSync(hookPath)) {
    // Never clobber someone else's hook without leaving them a copy.
    copyFileSync(hookPath, `${hookPath}.bak`);
  }

  writeFileSync(hookPath, `#!/bin/sh\nnode "${cliPath}" check || exit 1\n`);
  chmodSync(hookPath, 0o755);

  return hookPath;
}
