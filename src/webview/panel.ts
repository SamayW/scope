import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';

/** Sidebar webview. Owns the messaging, not the analysis. */
export class ScopePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'scope.sidebar';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onReady: () => void
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    const html = vscode.Uri.joinPath(this.extensionUri, 'media', 'ui.html');
    view.webview.html = readFileSync(html.fsPath, 'utf8');

    view.webview.onDidReceiveMessage((message: { type: string; hunkId?: string }) => {
      if (message.type === 'ready') {
        this.onReady();
        return;
      }
      // every other message name maps straight onto a scope.* command
      void vscode.commands.executeCommand(`scope.${message.type}`, message.hunkId);
    });
  }

  post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  reveal(): void {
    this.view?.show?.(true);
  }
}
