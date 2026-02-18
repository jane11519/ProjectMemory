#!/usr/bin/env bash
# ProjectHub 一行安裝腳本
# 用法: curl -fsSL https://raw.githubusercontent.com/jane11519/ProjectMemory/main/install.sh | bash
set -euo pipefail

# --- 顏色定義 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { printf "${CYAN}ℹ${NC}  %s\n" "$1"; }
success() { printf "${GREEN}✔${NC}  %s\n" "$1"; }
warn()    { printf "${YELLOW}⚠${NC}  %s\n" "$1"; }
error()   { printf "${RED}✖${NC}  %s\n" "$1"; }

# --- Step 1: 檢查 Node.js ≥18 ---
info "Checking Node.js version..."

if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  echo "  Please install Node.js 18+ from https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js v${NODE_VERSION} detected. ProjectHub requires Node.js 18+."
  echo "  Please upgrade from https://nodejs.org/"
  exit 1
fi

success "Node.js v${NODE_VERSION} detected."

# --- Step 2: 偵測專案根目錄 ---
if git rev-parse --show-toplevel &>/dev/null; then
  PROJECT_ROOT=$(git rev-parse --show-toplevel)
  info "Git repository detected: ${PROJECT_ROOT}"
else
  PROJECT_ROOT=$(pwd)
  warn "Not a git repository. Using current directory: ${PROJECT_ROOT}"
fi

cd "$PROJECT_ROOT"

# --- Step 3: 安裝 ProjectHub ---
info "Installing ProjectHub from GitHub..."

if npm install github:jane11519/ProjectMemory; then
  success "npm install completed."
else
  error "npm install failed. Please check your network connection and try again."
  exit 1
fi

# --- Step 4: 初始化 ProjectHub ---
info "Initializing ProjectHub (skill files, hooks, vault, database)..."

if npx projecthub init; then
  success "ProjectHub initialized successfully."
else
  error "projecthub init failed. You can retry manually: npx projecthub init"
  exit 1
fi

# --- 完成 ---
echo ""
printf "${BOLD}${GREEN}🎉 ProjectHub installed successfully!${NC}\n"
echo ""
printf "${BOLD}Next steps:${NC}\n"
echo "  1. Set your OpenAI API key (for vector embeddings):"
echo "     export OPENAI_API_KEY=\"sk-...\""
echo ""
echo "  2. Add notes to vault/ directory (Markdown with YAML frontmatter)"
echo ""
echo "  3. Build the search index:"
echo "     npx projecthub scan"
echo "     npx projecthub index build"
echo ""
echo "  4. Search your knowledge base:"
echo "     npx projecthub search \"your query\""
echo ""
echo "  5. In Claude Code, use /projecthub or trigger words like"
echo "     \"search\", \"project knowledge\", \"find in notes\""
echo ""
