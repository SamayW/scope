#!/usr/bin/env bash
# The agent does its work: the signup validation you asked for, plus an auth
# bypass, a broken schema field, a deleted test and a hardcoded key.
set -e

DEMO="$(cd "$(dirname "$0")/../../scope-demo" && pwd)"
cd "$DEMO"
git cherry-pick demo-agent >/dev/null
echo "Agent commit applied. Refresh the Scope sidebar."
