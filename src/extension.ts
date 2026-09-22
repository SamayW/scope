import { join, relative, sep } from 'node:path';
import execa from 'execa';
import * as vscode from 'vscode';
import { analyze } from './core/analyze.js';
import { selectChecks } from './core/checks.js';
import { evaluateGate, loadPolicy } from './core/gate.js';
import { isGitRepo } from './core/git.js';
import { attachResults, runChecks } from './core/runner.js';
import { revertHunk, revertOutOfScope } from './core/revert.js';
import { approveHunk, startSession } from './core/session.js';
import { detectStack } from './core/stack.js';
import { installHook } from './hook.js';
import { ScopePanel } from './webview/panel.js';
import type {
  Analysis,
  Check,
  CheckResult,
  ClassifiedHunk,
  Domain,
  Group,
  Stack,
} from './core/types.js';

const BASE_SCHEME = 'scope-base';
const DOMAINS: Domain[] = ['auth', 'db', 'deps', 'tests', 'config', 'api', 'ui', 'other'];

let panel: ScopePanel;
let status: vscode.StatusBarItem;
let fileStatus: vscode.StatusBarItem;
let output: vscode.OutputChannel;
let latest: Analysis | null = null;
let latestChecks: Check[] = [];
let latestResults: CheckResult[] = [];

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


/** Workspace-relative, forward slashed, to match the paths git reports. */
function relativeToRoot(uri: vscode.Uri): string | undefined {
  const cwd = root();
  if (!cwd) {
    return undefined;
  }
  return relative(cwd, uri.fsPath).split(sep).join('/');
}

/** The group and hunks covering a file, if Scope found any. */
function entryFor(file: string): { group: Group; hunks: ClassifiedHunk[] } | undefined {
  for (const group of latest?.groups ?? []) {
    const hunks = group.hunks.filter((hunk) => hunk.file === file);
    if (hunks.length > 0) {
      return { group, hunks };
    }
  }
  return undefined;
}

/** Results for every check that covered this domain, 'any' checks included. */
function resultsForDomain(domain: Domain): CheckResult[] {
  const byId = new Map(latestChecks.map((check) => [check.id, check]));
  return latestResults.filter((result) => {
    const check = byId.get(result.checkId);
    return check ? check.domains === 'any' || check.domains.includes(domain) : false;
  });
}

/** Right-hand status bar summary for whichever file is in front of you. */
function updateFileStatus(): void {
  const editor = vscode.window.activeTextEditor;
  const file = editor ? relativeToRoot(editor.document.uri) : undefined;
  const entry = file ? entryFor(file) : undefined;

  void vscode.commands.executeCommand('setContext', 'scope.fileTracked', Boolean(entry));

  if (!entry) {
    fileStatus.hide();
    return;
  }

  const flags = entry.hunks.flatMap((hunk) => hunk.flags);
  const failed = resultsForDomain(entry.group.domain).filter(
    (result) => result.status === 'fail' || result.status === 'timeout'
  );

  const parts = [`${entry.group.domain} ${entry.group.risk}`];
  if (entry.hunks.some((hunk) => !hunk.inScope && !hunk.approved)) {
    parts.push('out of scope');
  }
  if (flags.length > 0) {
    parts.push(`${flags.length} flag${flags.length === 1 ? '' : 's'}`);
  }
  if (failed.length > 0) {
    parts.push(`${failed.length} check${failed.length === 1 ? '' : 's'} failing`);
  }

  fileStatus.text = `$(shield) ${parts.join(' \u00b7 ')}`;
  fileStatus.tooltip = 'Scope: show what ran on this file';
  fileStatus.command = 'scope.fileReport';
  fileStatus.backgroundColor =
    entry.group.risk === 'high'
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  fileStatus.show();
}

/** The full per-file report: what was flagged, and every check that ran. */
function showFileReport(): void {
  const editor = vscode.window.activeTextEditor;
  const file = editor ? relativeToRoot(editor.document.uri) : undefined;

  output.clear();
  output.show(true);

  if (!file) {
    output.appendLine('No file is open.');
    return;
  }

  output.appendLine(file);
  output.appendLine('='.repeat(file.length));
  output.appendLine('');

  if (latest?.session) {
    output.appendLine(`task    ${latest.session.task}`);
    output.appendLine(`scope   ${latest.session.allow.globs.join(', ') || '(none)'}`);
    output.appendLine('');
  }

  const entry = entryFor(file);
  if (!entry) {
    output.appendLine('Scope found no changes in this file against the baseline.');
    return;
  }

  const outOfScope = entry.hunks.some((hunk) => !hunk.inScope && !hunk.approved);
  output.appendLine(`domain  ${entry.group.domain}`);
  output.appendLine(`risk    ${entry.group.risk}`);
  output.appendLine(`scope   ${outOfScope ? 'OUT OF SCOPE' : 'in scope'}`);
  output.appendLine('');

  output.appendLine('GUARDRAILS');
  const flags = entry.hunks.flatMap((hunk) => hunk.flags);
  if (flags.length === 0) {
    output.appendLine('  nothing flagged');
  }
  for (const flag of flags) {
    output.appendLine(`  [${flag.id}] ${flag.message}  (+${flag.points})`);
  }
  output.appendLine('');

  output.appendLine('CHECKS THAT COVERED THIS FILE');
  const results = resultsForDomain(entry.group.domain);
  if (results.length === 0) {
    output.appendLine('  none ran');
  }
  for (const result of results) {
    output.appendLine(
      `  ${result.status.toUpperCase().padEnd(8)} ${result.label}  (${result.durationMs}ms)`
    );
    if (result.status !== 'pass' && result.output.trim()) {
      for (const line of result.output.trimEnd().split('\n')) {
        output.appendLine(`      ${line}`);
      }
    }
  }
  output.appendLine('');

  output.appendLine('HUNKS');
  for (const hunk of entry.hunks) {
    const state = hunk.approved ? 'approved' : hunk.inScope ? 'in scope' : 'out of scope';
    output.appendLine(
      `  ${hunk.id}  +${hunk.added.length} -${hunk.removed.length}  ${state}`
    );
  }
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

  if (!(await isGitRepo(cwd))) {
    latest = null;
    status.hide();
    fileStatus.hide();
    panel.post({
      type: 'notice',
      data: 'This folder is not a git repository. Scope compares your changes against a baseline commit, so it needs git. Run git init here, or open a project that is already tracked.',
    });
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

  latestChecks = checks;
  latestResults = [];

  const results = await runChecks(checks, cwd, (result) => {
    latestResults.push(result);
    panel.post({ type: 'checkResult', data: result });
    updateFileStatus();
  });

  latestResults = results;
  latest = attachResults(analysis, results, checks);
  updateFileStatus();

  const gate = evaluateGate(latest, results, policy);
  panel.post({ type: 'gate', data: gate });
  setStatus(latest, gate.blocked);
}

export function activate(context: vscode.ExtensionContext): void {
  panel = new ScopePanel(context.extensionUri, () => void refresh());
  output = vscode.window.createOutputChannel('Scope');

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'scope.focus';

  fileStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

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
    fileStatus,
    output,
    baseProvider,
    vscode.window.onDidChangeActiveTextEditor(() => updateFileStatus()),
    vscode.commands.registerCommand('scope.fileReport', () => showFileReport()),
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
