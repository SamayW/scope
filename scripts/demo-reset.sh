#!/usr/bin/env bash
# Puts the demo repo back to the moment before the agent ran, with a Scope
# session already declared. Run this before every rehearsal.
set -e

SCOPE="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="$SCOPE/../scope-demo"

cd "$DEMO"

# A fresh clone has the demo branches only as origin/*, so resolve either form.
ref() {
  if git rev-parse --verify -q "refs/heads/$1" >/dev/null; then
    echo "$1"
  elif git rev-parse --verify -q "refs/remotes/origin/$1" >/dev/null; then
    echo "origin/$1"
  else
    echo "Missing branch '$1' in $(pwd)." >&2
    echo "Clone the demo repo with its branches:" >&2
    echo "  git clone https://github.com/SamayW/scope-demo.git ../scope-demo" >&2
    exit 1
  fi
}

BASE=$(ref demo-base)

# a rehearsal that stopped mid cherry-pick would otherwise block the reset
git cherry-pick --abort 2>/dev/null || true
git checkout -q -B demo "$BASE"
# hard reset, not just a checkout: a previous rehearsal may have left tracked
# files modified, and those would show up as phantom changes in the demo
git reset -q --hard "$BASE"
git clean -qfd -e node_modules
rm -rf .scope

node "$SCOPE/out/cli.js" start "add signup form validation" --allow 'src/app/signup/*.tsx'

echo ""
echo "Demo repo is clean, on branch 'demo', with the session declared."
echo "To play the agent's move:  npm run demo:agent"
