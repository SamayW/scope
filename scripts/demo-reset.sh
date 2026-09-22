#!/usr/bin/env bash
# Puts the demo repo back to the moment before the agent ran, with a Scope
# session already declared. Run this before every rehearsal.
set -e

SCOPE="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$SCOPE/../scope-demo"

cd "$DEMO"
git checkout -q -B demo demo-base
git clean -qfd -e node_modules
rm -rf .scope

node "$SCOPE/out/cli.js" start "add signup form validation" --allow 'src/app/signup/*.tsx'

echo ""
echo "Demo repo is clean, on branch 'demo', with the session declared."
echo "To play the agent's move:  npm run demo:agent"
