#!/usr/bin/env bash
# TaskCompleted hook: run incremental index update and session save
# Triggered when a Claude Code task completes

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

# 增量更新索引（如果有 dirty files）
DIRTY_FILE="$REPO_ROOT/vault/.projecthub/dirty-files.txt"
if [ -f "$DIRTY_FILE" ] && [ -s "$DIRTY_FILE" ]; then
  $CLI index update --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
fi

# 保存 session 狀態
$CLI session save --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
