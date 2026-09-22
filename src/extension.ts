import * as vscode from 'vscode';
import { analyze } from './core/analyze.js';
import { ScopeSidebarProvider } from './vscode/sidebar.js';

export function activate(context: vscode.ExtensionContext): void {
  const sidebar = new ScopeSidebarProvider();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ScopeSidebarProvider.viewType, sidebar),
    vscode.commands.registerCommand('scope.refresh', async () => {
      const analysis = await analyze(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
      vscode.window.showInformationMessage(`Scope: ${analysis.groups.length} groups`);
    })
  );
}

export function deactivate(): void {}
