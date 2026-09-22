#!/usr/bin/env bash
# The agent does its work: the signup validation you asked for, plus an auth
# bypass, a broken schema field, a deleted test and a hardcoded key.
set -e

DEMO="$(cd "$(dirname "$0")/../../scope-demo" && pwd)"
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

AGENT=$(ref demo-agent)

# clear anything a previous run left half finished
git cherry-pick --abort 2>/dev/null || true

if git log --format=%s -1 | grep -q '^agent: '; then
  echo "The agent move is already applied, so there is nothing to do."
  echo "Run 'npm run demo:reset' first if you want to replay it."
  exit 0
fi

if ! git cherry-pick "$AGENT" >/dev/null 2>&1; then
  git cherry-pick --abort 2>/dev/null || true
  echo "Could not apply the agent commit."
  echo "Run 'npm run demo:reset' and try again."
  exit 1
fi

echo "Agent commit applied. Refresh the Scope sidebar."
