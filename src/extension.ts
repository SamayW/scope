import { join } from 'node:path';
import execa from 'execa';
import * as vscode from 'vscode';
import { analyze } from './core/analyze.js';
import { selectChecks } from './core/checks.js';
import { loadPolicy } from './core/gate.js';
import { evaluateGate } from './core/gate.js';
import { attachResults, runChecks } from './core/runner.js';
import { revertHunk, revertOutOfScope } from './core/revert.js';
import { approveHunk, startSession } from './core/session.js';
import { detectStack } from './core/stack.js';
import { installHook } from './hook.js';
import { ScopePanel } from './webview/panel.js';
import type { Analysis, ClassifiedHunk, Domain, Stack } from './core/types.js';

const BASE_SCHEME = 'scope-base';
const DOMAINS: Domain[] = ['auth', 'db', 'deps', 'tests', 'config', 'api', 'ui', 'other'];

let panel: ScopePanel;
let status: vscode.StatusBarItem;
let latest: Analysis | null = null;

function root(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function findHunk(hunkId: string): ClassifiedHunk | undefined {
  return latest?.groups.flatMap((group) => group.hunks).find((hunk) => hunk.id === hunkId);
}

function setStatus(analysis: Analysis, blocked: boolean): void {
  const high = analysis.groups.filter((group) => group.risk === 'high').length;

  if (blocked) {
    status.text = `$(shield) Scope: ${high} high, BLOCKED`;
    status.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    status.text = '$(check) Scope: OK';
    status.backgroundColor = undefined;
  }
  status.show();
}

let running = false;
let queued = false;

/** Never two at once; at most one more waiting. */
async function refresh(): Promise<void> {
  if (running) {
    queued = true;
    return;
  }

  running = true;
  try {
    await runRefresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Scope: ${(error as Error).message}`);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void refresh();
    }
  }
}

async function runRefresh(): Promise<void> {
  const cwd = root();
  if (!cwd) {
    return;
  }

  const analysis = await analyze(cwd);
  latest = analysis;
  panel.post({ type: 'analysis', data: analysis });

  const policy = loadPolicy(cwd);

  let stack: Stack;
  try {
    stack = detectStack(cwd);
  } catch {
    return;
  }

  const checks = selectChecks(stack, analysis, policy);
  panel.post({ type: 'checksStarted', data: checks });

  const results = await runChecks(checks, cwd, (result) => {
    panel.post({ type: 'checkResult', data: result });
  });

  latest = attachResults(analysis, results, checks);

  const gate = evaluateGate(latest, results, policy);
  panel.post({ type: 'gate', data: gate });
  setStatus(latest, gate.blocked);
}

export function activate(context: vscode.ExtensionContext): void {
  panel = new ScopePanel(context.extensionUri, () => void refresh());
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'scope.focus';

  // Left-hand side of the diff view: the file as it was at the baseline.
  const baseProvider = vscode.workspace.registerTextDocumentContentProvider(BASE_SCHEME, {
    async provideTextDocumentContent(uri) {
      const cwd = root();
      if (!cwd) {
        return '';
      }
      const result = await execa('git', ['show', `${uri.query}:${uri.path.slice(1)}`], {
        cwd,
        reject: false,
      });
      // empty is correct for a file that did not exist at the baseline
      return result.exitCode === 0 ? result.stdout : '';
    },
  });

  let timer: NodeJS.Timeout | undefined;
  const onSave = vscode.workspace.onDidSaveTextDocument(() => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => void refresh(), 1000);
  });

  context.subscriptions.push(
    status,
    baseProvider,
    onSave,
    vscode.window.registerWebviewViewProvider(ScopePanel.viewType, panel),

    vscode.commands.registerCommand('scope.focus', () => {
      void vscode.commands.executeCommand('scope.sidebar.focus');
    }),

    vscode.commands.registerCommand('scope.refresh', () => refresh()),

    vscode.commands.registerCommand('scope.start', async () => {
      const cwd = root();
      if (!cwd) {
        return;
      }

      const task = await vscode.window.showInputBox({
        title: 'Scope: what was the agent asked to do?',
        placeHolder: 'add signup form validation',
      });
      if (!task) {
        return;
      }

      const domains = await vscode.window.showQuickPick(DOMAINS, {
        title: 'Allowed domains (optional)',
        canPickMany: true,
      });

      const globs = await vscode.window.showInputBox({
        title: 'Allowed paths, comma separated',
        placeHolder: 'src/app/signup/*.tsx',
      });

      await startSession(cwd, task, {
        globs: (globs ?? '')
          .split(',')
          .map((glob) => glob.trim())
          .filter(Boolean),
        domains: (domains ?? []) as Domain[],
      });

      await refresh();
    }),

    vscode.commands.registerCommand('scope.openDiff', async (hunkId: string) => {
      const cwd = root();
      const hunk = findHunk(hunkId);
      const baseline = latest?.session?.baseline;
      if (!cwd || !hunk || !baseline) {
        return;
      }

      const left = vscode.Uri.parse(`${BASE_SCHEME}:/${hunk.file}?${baseline}`);
      const right = vscode.Uri.file(join(cwd, hunk.file));
      await vscode.commands.executeCommand('vscode.diff', left, right, `${hunk.file} (Scope)`);
    }),

    vscode.commands.registerCommand('scope.approve', async (hunkId: string) => {
      const cwd = root();
      if (!cwd || !hunkId) {
        return;
      }
      approveHunk(cwd, hunkId);
      await refresh();
    }),

    vscode.commands.registerCommand('scope.revertHunk', async (hunkId: string) => {
      const cwd = root();
      const hunk = findHunk(hunkId);
      if (!cwd || !hunk) {
        return;
      }

      try {
        await revertHunk(cwd, hunk);
      } catch (error) {
        vscode.window.showErrorMessage(`Scope: ${(error as Error).message}`);
      }
      await refresh();
    }),

    vscode.commands.registerCommand('scope.revertOutOfScope', async () => {
      const cwd = root();
      if (!cwd || !latest) {
        return;
      }

      const count = latest.groups
        .flatMap((group) => group.hunks)
        .filter((hunk) => !hunk.inScope && !hunk.approved).length;

      const confirm = await vscode.window.showWarningMessage(
        `Revert ${count} out-of-scope hunk${count === 1 ? '' : 's'}?`,
        { modal: true },
        'Revert'
      );
      if (confirm !== 'Revert') {
        return;
      }

      const { reverted, failed } = await revertOutOfScope(cwd, latest);
      if (failed.length > 0) {
        vscode.window.showWarningMessage(
          `Scope reverted ${reverted.length}, could not revert ${failed.length}.`
        );
      } else {
        vscode.window.showInformationMessage(`Scope reverted ${reverted.length} hunks.`);
      }

      await refresh();
    }),

    vscode.commands.registerCommand('scope.installHook', () => {
      const cwd = root();
      if (!cwd) {
        return;
      }
      const cliPath = join(context.extensionPath, 'out', 'cli.js');
      installHook(cwd, cliPath);
      vscode.window.showInformationMessage('Scope: pre-push hook installed.');
    })
  );
}

export function deactivate(): void {}
