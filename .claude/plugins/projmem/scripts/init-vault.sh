#!/usr/bin/env bash
# Initialize projmem vault directory structure and database
# Usage: bash init-vault.sh [repo-root]

set -euo pipefail

REPO_ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
VAULT_DIR="$REPO_ROOT/vault"
PROJMEM_DIR="$VAULT_DIR/.projmem"

echo "Initializing projmem vault in: $VAULT_DIR"

# 建立 vault 目錄結構
mkdir -p "$VAULT_DIR/code-notes"
mkdir -p "$VAULT_DIR/rules"
mkdir -p "$VAULT_DIR/integrations"
mkdir -p "$VAULT_DIR/sessions"
mkdir -p "$VAULT_DIR/structure"
mkdir -p "$PROJMEM_DIR"

# 智慧 CLI 偵測：全域/PATH → npm local install → 開發模式 → 跳過 DB 初始化
if command -v projmem &>/dev/null; then
  CLI="projmem"
elif [ -x "$REPO_ROOT/node_modules/.bin/projmem" ]; then
  CLI="$REPO_ROOT/node_modules/.bin/projmem"
elif [ -f "$REPO_ROOT/dist/cli/index.js" ]; then
  CLI="node $REPO_ROOT/dist/cli/index.js"
else
  CLI=""
fi

# 初始化 SQLite 資料庫（透過 CLI）
if [ -n "$CLI" ]; then
  echo "Initializing database via CLI..."
  $CLI health --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
else
  echo "Warning: CLI not found. Run 'npm run build' first, then re-run this script."
fi

# 建立 vault .gitignore（排除 SQLite 資料庫和暫存檔）
cat > "$VAULT_DIR/.gitignore" << 'GITIGNORE'
# projmem SQLite database and runtime artifacts
.projmem/index.db
.projmem/index.db-wal
.projmem/index.db-shm
.projmem/dirty-files.txt
.projmem/audit.log
GITIGNORE

# 建立 .projmem.json（若不存在）
if [ ! -f "$REPO_ROOT/.projmem.json" ]; then
  cat > "$REPO_ROOT/.projmem.json" << 'CONFIG'
{
  "version": 1,
  "vault": {
    "root": "vault",
    "folders": ["code-notes", "rules", "integrations", "sessions", "structure"]
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimension": 1536,
    "maxBatchSize": 100
  },
  "search": {
    "defaultTopK": 10,
    "candidateMultiplier": 5,
    "weights": { "lexical": 0.7, "vector": 0.3 }
  },
  "namespacePatterns": ["services/*", "packages/*", "apps/*", "libs/*", "modules/*"]
}
CONFIG
  echo "Created .projmem.json"
fi

echo "Vault initialized successfully."
echo ""
echo "Next steps:"
echo "  1. Add Markdown notes to vault/code-notes/"
echo "  2. Set OPENAI_API_KEY environment variable"
echo "  3. Run: npx projmem scan"
echo "  4. Run: npx projmem index build"
echo "  5. Use /projmem in Claude Code"
