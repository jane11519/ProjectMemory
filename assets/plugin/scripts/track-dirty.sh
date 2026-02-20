#!/usr/bin/env bash
# PostToolUse hook: track modified vault files for incremental indexing
# Triggered by Write/Edit tool use on vault Markdown files
# Usage: track-dirty.sh <modified-file-path>

set -euo pipefail

MODIFIED_FILE="${1:-}"
if [ -z "$MODIFIED_FILE" ]; then
  exit 0
fi

# 只追蹤 vault 下的 Markdown 檔案
if [[ "$MODIFIED_FILE" != *vault/*.md ]]; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DIRTY_FILE="$REPO_ROOT/vault/.projmem/dirty-files.txt"

# 確保目錄存在
mkdir -p "$(dirname "$DIRTY_FILE")"

# 避免重複追加
if ! grep -qxF "$MODIFIED_FILE" "$DIRTY_FILE" 2>/dev/null; then
  echo "$MODIFIED_FILE" >> "$DIRTY_FILE"
fi
