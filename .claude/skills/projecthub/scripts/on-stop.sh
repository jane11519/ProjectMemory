#!/usr/bin/env bash
# Stop hook: save session state on conversation end
# Runs asynchronously with 60s timeout

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLI="node $REPO_ROOT/dist/cli/index.js"

# 保存最終 session 狀態
$CLI session save --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
