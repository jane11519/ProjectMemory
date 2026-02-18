#!/usr/bin/env bash
# Initialize ProjectHub vault directory structure and database
# Usage: bash .claude/skills/projecthub/scripts/init-vault.sh [repo-root]

set -euo pipefail

REPO_ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
VAULT_DIR="$REPO_ROOT/vault"
PROJECTHUB_DIR="$VAULT_DIR/.projecthub"

echo "Initializing ProjectHub vault in: $VAULT_DIR"

# 建立 vault 目錄結構
mkdir -p "$VAULT_DIR/code-notes"
mkdir -p "$VAULT_DIR/rules"
mkdir -p "$VAULT_DIR/integrations"
mkdir -p "$VAULT_DIR/sessions"
mkdir -p "$VAULT_DIR/structure"
mkdir -p "$PROJECTHUB_DIR"

# 初始化 SQLite 資料庫（透過 CLI）
if [ -f "$REPO_ROOT/dist/cli/index.js" ]; then
  echo "Initializing database via CLI..."
  node "$REPO_ROOT/dist/cli/index.js" health --repo-root "$REPO_ROOT" --format json 2>/dev/null || true
else
  echo "Warning: CLI not built yet. Run 'npm run build' first, then re-run this script."
fi

# 建立 vault .gitignore（排除 SQLite 資料庫和暫存檔）
cat > "$VAULT_DIR/.gitignore" << 'GITIGNORE'
# ProjectHub SQLite database and runtime artifacts
.projecthub/index.db
.projecthub/index.db-wal
.projecthub/index.db-shm
.projecthub/dirty-files.txt
.projecthub/audit.log
GITIGNORE

# 建立 .projecthub.json（若不存在）
if [ ! -f "$REPO_ROOT/.projecthub.json" ]; then
  cat > "$REPO_ROOT/.projecthub.json" << 'CONFIG'
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
  echo "Created .projecthub.json"
fi

echo "Vault initialized successfully."
echo ""
echo "Next steps:"
echo "  1. Add Markdown notes to vault/code-notes/"
echo "  2. Set OPENAI_API_KEY environment variable"
echo "  3. Run: npm run build"
echo "  4. Run: node dist/cli/index.js scan --repo-root ."
echo "  5. Run: node dist/cli/index.js index build --repo-root ."
