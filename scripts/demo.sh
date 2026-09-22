#!/usr/bin/env bash
# One command, whole demo environment: clean baseline, fresh session with no
# approvals carried over, and the agent's commit already applied.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
bash "$HERE/demo-reset.sh" >/dev/null
bash "$HERE/demo-agent.sh" >/dev/null

DEMO="$(cd "$HERE/../../scope-demo" && pwd)"
echo "Demo is staged."
echo "  repo:    $DEMO"
echo "  branch:  $(git -C "$DEMO" rev-parse --abbrev-ref HEAD)"
echo "  task:    add signup form validation"
echo "  scope:   src/app/signup/*.tsx"
echo ""
echo "Refresh the Scope sidebar. Expect BLOCKED with auth, tests and db out of scope."
