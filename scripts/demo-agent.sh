#!/usr/bin/env bash
# The agent does its work: the signup validation you asked for, plus an auth
# bypass, a broken schema field, a deleted test and a hardcoded key.
set -e

DEMO="$(cd "$(dirname "$0")/../../scope-demo" && pwd)"
cd "$DEMO"

# clear anything a previous run left half finished
git cherry-pick --abort 2>/dev/null || true

if git log --format=%s -1 | grep -q '^agent: '; then
  echo "The agent move is already applied, so there is nothing to do."
  echo "Run 'npm run demo:reset' first if you want to replay it."
  exit 0
fi

if ! git cherry-pick demo-agent >/dev/null 2>&1; then
  git cherry-pick --abort 2>/dev/null || true
  echo "Could not apply the agent commit."
  echo "Run 'npm run demo:reset' and try again."
  exit 1
fi

echo "Agent commit applied. Refresh the Scope sidebar."
