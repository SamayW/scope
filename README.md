# Scope

A local pre-push gate for AI-agent changes. It groups the diff by domain, ranks risk, flags anything outside the declared scope, runs only the relevant checks, and blocks unsafe pushes.

Offline, instant, deterministic. No model, no API key, nothing leaves the machine. An agent cannot talk its way past it, because it runs as a git hook.

## The problem

AI agents edit many files at once. You either rubber-stamp the result or spend an hour reading it. Agents also do things nobody asked for: disabling auth, changing schemas, deleting the test that was failing. Existing review bots run after the push, and none of them know what the agent was actually asked to do.

Scope runs before the push and does know, because you tell it.

## How it works

```sh
scope start "add signup form validation" --allow 'src/app/signup/*.tsx'
# the agent works
scope check
```

`start` pins the current commit as the baseline and records what you allowed. `check` then reads everything that changed since, and answers three questions:

1. **What changed, and where does it belong?** Hunks are classified into domains: `auth`, `db`, `deps`, `tests`, `config`, `api`, `ui`. Path rules first, content rules as fallback.
2. **How dangerous is it?** Ten rules score each hunk: deleted tests, skipped tests, removed assertions, secrets, env files, auth and schema edits, new dependencies, suppressed lint, empty catch blocks, CI changes. Anything outside the declared scope counts double, which is what floats it to the top.
3. **Does it still build?** Only the checks the diff warrants. TypeScript changed, so run `tsc`. A `db` group exists, so run `prisma validate`. Nothing touched `package.json`, so skip the audit.

Then it blocks or allows. Failing checks, deleted tests, secrets and unapproved out-of-scope work each stop a push, and the policy is configurable in `.scope.yml`.

## Getting started

```sh
git clone https://github.com/SamayW/scope.git
git clone https://github.com/SamayW/scope-demo.git      # needed for the demo and four test suites

cd scope            # the scripts run from inside this folder, not its parent
npm install
npm run compile
npm run demo        # stages the demo scenario in scope-demo
```

Then open the `scope` folder in VS Code and press F5, or install the vsix below and open `scope-demo` directly.

Everything is cross platform; the scripts are Node rather than shell.

## Install

Grab `scope-0.0.1.vsix` from the repo and either:

```sh
code --install-extension scope-0.0.1.vsix
```

or in VS Code: Extensions panel, the `...` menu, **Install from VSIX**.

For the CLI and the git hook:

```sh
npm install && npm run compile && npm link
```

## The sidebar

Groups sorted worst first, colour-coded by risk, with an `OUT OF SCOPE` badge where it applies. Each card lists what was flagged and the checks that covered it; a failing check expands to its real output. Every hunk gets **Diff**, **Approve** and **Revert**, and there is one **Revert all out-of-scope changes** button for the common case.

A status bar item on the right tracks whichever file you are looking at, and the shield in the editor title bar opens a full report: the guardrails that fired on that file, every check that ran, and the hunks with their scope status.

## Commands

```sh
npm run compile        # tsc
npm test               # unit tests
npm run itest          # 13 tests inside a real VS Code extension host
npm run package        # build the vsix
npm run demo           # stage the demo repo end to end
```

`scope start | check | approve | install-hook` from the CLI.

Some suites exercise the engine against the demo repository. Clone it as a sibling to run them; without it they skip rather than fail:

```sh
git clone https://github.com/SamayW/scope-demo.git ../scope-demo
```

## Layout

```
src/core/     the engine, never imports vscode
  git.ts      read diffs, including untracked files
  diff.ts     parse into hunks that stay applyable by git apply -R
  classify.ts hunk -> domain
  risk.ts     hunk -> risk flags and score
  scope.ts    in scope or not
  group.ts    hunks -> sorted groups
  analyze.ts  the pipeline
  stack.ts    detect TS, Next, Prisma, eslint, Docker, the test runner, the package manager
  checks.ts   pick the commands the diff warrants
  runner.ts   run them in parallel, stream results
  revert.ts   revert a hunk, a file, or everything out of scope
  gate.ts     block or allow, and load .scope.yml
src/cli.ts    scope start | check | approve | install-hook
src/hook.ts   the pre-push hook installer
src/webview/  the sidebar provider
media/ui.html the sidebar itself
```

`src/core` must never import `vscode`, because the CLI and the git hook run it outside the editor:

```sh
grep -r "from 'vscode'" src/core   # must print nothing
```

## Config

`.scope.yml`, all optional:

```yaml
block_on: [failing_checks, deleted_tests, secrets, out_of_scope]
groups:
  db: ["npm run db:check"]
```

A malformed file falls back to blocking on everything, rather than quietly disabling the gate.

## Demo

`../scope-demo` is a minimal Next and Prisma app staging one scenario: an agent was asked to add signup validation, and did, but also slipped in an auth bypass, a schema field that breaks `prisma validate`, a deleted test and a hardcoded key. All in one nineteen-line commit.

```sh
npm run demo
```

Clean baseline, session declared, agent commit applied. Open `scope-demo`, refresh the sidebar, and it reports three groups out of scope. Revert them and it goes green.

The in-scope signup change is the control: a tool that flags all four files is useless, one that flags three and clears one is the product.
