# Scope

A local pre-push gate for AI-agent changes. It groups the diff by domain, ranks
risk, flags anything outside the declared scope, runs only the relevant checks,
and blocks unsafe pushes.

Offline, instant, deterministic. No model, no API key, nothing leaves the
machine. Agents cannot bypass it because it runs as a git hook.

## Status: M0 scaffold

Module signatures are final. Bodies throw `not implemented`, except the stubs
noted below, which return correctly typed fake data so the extension and the
CLI both run today.

Stubbed for M0: `analyze`, `selectChecks`, `runChecks`, `evaluateGate`.

## Commands

```sh
npm install
npm run compile      # tsc -p ./
npm test             # vitest run, contract test
node out/cli.js check
```

Press F5 in VS Code to launch the extension host, then run **Scope: Refresh**
from the command palette.

## Layout

```
src/
  extension.ts     VS Code entry point
  cli.ts           commander entry point
  vscode/          anything that imports 'vscode'
  core/            engine, never imports 'vscode'
    types.ts       the shared contract
fixtures/
  analysis.json    fake Analysis, 4 groups, drives every stub
  sample.diff      real diff from the demo repo
test/
  contract.test.ts holds the fixture to the contract
```

`src/core` must stay free of `vscode` imports so the CLI and the hook can use
it. Enforced by:

```sh
grep -r "from 'vscode'" src/core   # must print nothing
```

## Module ownership

| Area | Files |
|---|---|
| Diff, classifier, risk, scope | `core/diff.ts`, `core/classify.ts`, `core/risk.ts`, `core/scope.ts` |
| Stack, checks, gate, session, CLI | `core/stack.ts`, `core/checks.ts`, `core/gate.ts`, `core/session.ts`, `cli.ts` |
| Sidebar, diff view, revert actions | `extension.ts`, `vscode/sidebar.ts` |

## Demo repo

`../scope-demo` is a separate git repo with a `base` tag and an `agent` branch
carrying one commit that plants an auth bypass, a broken schema field, a
deleted test, and a hardcoded key alongside the legitimate signup validation.

```sh
cd ../scope-demo
./reset-demo.sh      # git checkout -B demo base && git cherry-pick agent
```
