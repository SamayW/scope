#!/usr/bin/env bash
# Puts the demo repo back to the moment before the agent ran, with a Scope
# session already declared. Run this before every rehearsal.
set -e

SCOPE="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$SCOPE/../scope-demo"

cd "$DEMO"
# a rehearsal that stopped mid cherry-pick would otherwise block the reset
git cherry-pick --abort 2>/dev/null || true
git checkout -q -B demo demo-base
# hard reset, not just a checkout: a previous rehearsal may have left tracked
# files modified, and those would show up as phantom changes in the demo
git reset -q --hard demo-base
git clean -qfd -e node_modules
rm -rf .scope

node "$SCOPE/out/cli.js" start "add signup form validation" --allow 'src/app/signup/*.tsx'

echo ""
echo "Demo repo is clean, on branch 'demo', with the session declared."
echo "To play the agent's move:  npm run demo:agent"
