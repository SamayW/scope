import * as assert from 'node:assert';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';

// read from package.json so adding or changing the publisher cannot silently
// break this suite again
const EXTENSION_ID = `${require('../../../package.json').publisher}.${require('../../../package.json').name}`;

const EXPECTED_COMMANDS = [
  'scope.start',
  'scope.refresh',
  'scope.openDiff',
  'scope.approve',
  'scope.revertHunk',
  'scope.revertOutOfScope',
  'scope.installHook',
  'scope.focus',
  'scope.fileReport',
];

function root(): string {
  return vscode.workspace.workspaceFolders![0].uri.fsPath;
}

suite('Scope extension host', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, 'extension not found in the host');
    await extension.activate();
  });

  test('activates without throwing', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.strictEqual(extension.isActive, true);
  });

  test('registers every contributed command', async () => {
    const registered = await vscode.commands.getCommands(true);
    for (const command of EXPECTED_COMMANDS) {
      assert.ok(registered.includes(command), `${command} was never registered`);
    }
  });

  test('scope.refresh runs end to end against a real workspace', async () => {
    // this is the whole pipeline: analyze, detectStack, selectChecks,
    // runChecks, evaluateGate, plus every webview post along the way
    await vscode.commands.executeCommand('scope.refresh');
  });

  test('the scope-base provider serves the baseline copy of a file', async () => {
    const baseline = JSON.parse(
      readFileSync(join(root(), '.scope', 'session.json'), 'utf8')
    ).baseline as string;

    const uri = vscode.Uri.parse(`scope-base:/src/middleware.ts?${baseline}`);
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.getText();

    assert.ok(text.includes('export function middleware'), 'baseline content missing');
    // the agent's bypass must NOT be in the baseline side of the diff
    assert.ok(
      !text.includes('return NextResponse.next();\n  const session'),
      'baseline wrongly contains the agent bypass'
    );
  });

  test('the scope-base provider returns empty for a file absent at the baseline', async () => {
    const uri = vscode.Uri.parse('scope-base:/does/not/exist.ts?HEAD');
    const doc = await vscode.workspace.openTextDocument(uri);
    assert.strictEqual(doc.getText(), '');
  });

  test('scope.openDiff opens a diff editor', async () => {
    await vscode.commands.executeCommand('scope.refresh');
    await vscode.commands.executeCommand('scope.openDiff', 'src/middleware.ts#0');
    // vscode.diff swaps the active tab for a diff view
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab, 'no active tab after openDiff');
    assert.ok(
      tab.input instanceof vscode.TabInputTextDiff,
      `expected a diff tab, got ${tab.label}`
    );
  });

  test('scope.installHook writes an executable pre-push hook', async () => {
    await vscode.commands.executeCommand('scope.installHook');
    const hook = join(root(), '.git', 'hooks', 'pre-push');
    assert.ok(existsSync(hook), 'hook was not written');
    assert.ok(readFileSync(hook, 'utf8').includes('check'), 'hook does not invoke check');
  });

  test('scope.approve records an approval in the session', async () => {
    await vscode.commands.executeCommand('scope.approve', 'src/middleware.ts#0');
    const session = JSON.parse(readFileSync(join(root(), '.scope', 'session.json'), 'utf8'));
    assert.deepStrictEqual(session.approved, ['src/middleware.ts#0']);
  });

  test('scope.fileReport runs for a file the analysis covers', async () => {
    await vscode.commands.executeCommand('scope.refresh');
    const doc = await vscode.workspace.openTextDocument(join(root(), 'src', 'middleware.ts'));
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('scope.fileReport');
  });

  test('scope.revertHunk actually changes the file on disk', async () => {
    await vscode.commands.executeCommand('scope.refresh');

    const middleware = join(root(), 'src', 'middleware.ts');
    assert.ok(readFileSync(middleware, 'utf8').includes('sk-test-'), 'planted key missing');

    await vscode.commands.executeCommand('scope.revertHunk', 'src/middleware.ts#0');

    assert.ok(
      !readFileSync(middleware, 'utf8').includes('sk-test-'),
      'revertHunk did nothing to the file'
    );
  });

  test('scope.openDiff still works with no session, using the fork point', async () => {
    // it used to return silently when session.baseline was missing
    rmSync(join(root(), '.scope'), { recursive: true, force: true });
    await vscode.commands.executeCommand('scope.refresh');
    await vscode.commands.executeCommand('scope.openDiff', 'src/app/signup/page.tsx#0');

    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab?.input instanceof vscode.TabInputTextDiff, 'no diff tab without a session');
  });

  test('scope.openDiff works on a file the agent deleted', async () => {
    // close everything first: a leftover diff tab from another test made this
    // pass while the command was in fact failing
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('scope.refresh');

    const onDisk = join(root(), 'src', 'app', 'signup', 'signup.test.ts');
    assert.ok(!existsSync(onDisk), 'expected the test file to be deleted');

    await vscode.commands.executeCommand('scope.openDiff', 'src/app/signup/signup.test.ts#0');

    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    assert.ok(tab, 'no tab opened at all for the deleted file');
    assert.ok(tab.input instanceof vscode.TabInputTextDiff, `expected a diff tab, got ${tab.label}`);

    const input = tab.input as vscode.TabInputTextDiff;
    assert.ok(input.original.path.includes('signup.test.ts'), 'diff is not of the deleted file');
    // the right side must be virtual, since the file is gone
    assert.strictEqual(input.modified.scheme, 'scope-base');
  });

  test('the sidebar webview html loads from media', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    const html = join(extension.extensionPath, 'media', 'ui.html');
    assert.ok(existsSync(html), 'media/ui.html is missing from the packaged extension');
    assert.ok(readFileSync(html, 'utf8').includes('acquireVsCodeApi'));
  });
});
