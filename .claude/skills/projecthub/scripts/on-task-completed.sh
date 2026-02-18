#!/usr/bin/env bash
# TaskCompleted hook: run incremental index update and session save
# Triggered when a Claude Code task completes

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CLI="node $REPO_ROOT/dist/cli/index.js"

# 增量更新索引（如果有 dirty files）
DIRTY_FILE="$REPO_ROOT/vault/.projecthub/dirty-files.txt"
if [ -f "$DIRTY_FILE" ] && [ -s "$DIRTY_FILE" ]; then
  $CLI index update --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
fi

# 保存 session 狀態
$CLI session save --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
