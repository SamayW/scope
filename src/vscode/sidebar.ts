import * as vscode from 'vscode';

/** Empty webview shell. The groups tree lands here in M1. */
export class ScopeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'scope.sidebar';

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        padding: 12px;
      }
    </style>
  </head>
  <body>
    <p>No analysis yet. Run <strong>Scope: Refresh</strong>.</p>
  </body>
</html>`;
  }
}
