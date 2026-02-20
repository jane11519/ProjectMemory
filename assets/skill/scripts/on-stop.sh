#!/usr/bin/env bash
# Stop hook: capture conversation transcript on conversation end
# Runs asynchronously with 60s timeout

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# 智慧 CLI 偵測：全域/PATH → npm local install → 開發模式 → 靜默退出
if command -v projecthub &>/dev/null; then
  CLI="projecthub"
elif [ -x "$REPO_ROOT/node_modules/.bin/projecthub" ]; then
  CLI="$REPO_ROOT/node_modules/.bin/projecthub"
elif [ -f "$REPO_ROOT/dist/cli/index.js" ]; then
  CLI="node $REPO_ROOT/dist/cli/index.js"
else
  exit 0
fi

# 擷取對話 transcript 並建立 session
$CLI session capture --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
