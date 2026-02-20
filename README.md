# projmem

**專案級 Obsidian 知識庫，搭載多階段搜尋管線（RRF + Query Expansion + LLM Re-ranking）、MCP Server、以及階層式 Context 系統，為 Claude Code 打造的專案技能（Project Skill）。**

![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-339933?logo=node.js)
![Tests](https://img.shields.io/badge/tests-155%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)

---

## 功能特色

- **多階段搜尋管線** — BM25 + Vector → RRF 融合 → Query Expansion → LLM Re-ranking → Position-aware Blending
- **MCP Server** — 9 個 MCP 工具，支援 stdio 與 HTTP/SSE 傳輸，可直接接入 Claude Code
- **階層式 Context** — 虛擬路徑 metadata 系統，子路徑自動繼承父路徑 context
- **OpenAI-Compatible LLM** — 支援 OpenAI、Ollama、vLLM、LiteLLM、LocalAI 等任何相容 API endpoint
- **Dedicated Reranker 支援** — 除 chat completions 外，亦支援 `/v1/rerank` endpoint（Jina/Cohere/LocalAI cross-encoder）
- **漸進式揭露（Progressive Disclosure）** — `brief` / `normal` / `full` 三級細節控制
- **優雅降級（Graceful Degradation）** — 向量失敗 → BM25-only；BM25 失敗 → 向量；無 LLM → RRF-only
- **Session 持久化** — SQLite 儲存 + Markdown 匯出，支援滾動摘要、壓縮與結構化 Summarization
- **Session Summarize** — 透過 MCP tools 讓 Claude 直接生成結構化摘要（零外部 LLM 成本）
- **增量索引** — SHA-256 內容雜湊偵測變更 + Embedding 維度遷移安全檢查
- **Claude Code Hooks 整合** — `PostToolUse`、`TaskCompleted`、`Stop` 自動化追蹤
- **Monorepo / Submodule 命名空間** — 自動偵測 `.gitmodules` 與目錄樣式

---

## 架構概覽

projmem 採用 **Clean Architecture / Hexagonal Architecture**，從內到外分為五層：

```
┌─────────────────────────────────────────────────┐
│              CLI Layer + MCP Layer               │
│      commander · MCP Tools · Transports          │
├─────────────────────────────────────────────────┤
│               Application Layer                  │
│   ScanUseCase · IndexUseCase · SearchUseCase     │
│   SessionUseCase · HealthCheckUseCase            │
│   ContextUseCase                                 │
├─────────────────────────────────────────────────┤
│             Infrastructure Layer                 │
│  SQLite (better-sqlite3) · FTS5 · sqlite-vec     │
│  OpenAI Embedding · HttpLLMAdapter · Vault       │
├─────────────────────────────────────────────────┤
│                 Domain Layer                     │
│  Entities: Document, Chunk, Namespace, Session   │
│            SearchResult, PathContext              │
│  Value Objects: ContentHash, HybridScore          │
│                 RRFScore, StrongSignal             │
│                 SessionSummary                     │
│  Ports: EmbeddingPort, IndexPort, LLMPort        │
│         VaultPort, SessionPort                   │
└─────────────────────────────────────────────────┘
```

### 搜尋管線資料流

```
Query
  → [1] Initial BM25 搜尋
    → [2] Strong Signal 檢查（分數差距 ≥ 0.15 → 跳過 expansion）
      → [3] Query Expansion（LLM 產生 2 組替代查詢）
        → [4] Multi-Query 搜尋（原始 2× 權重 + 擴展 1× 權重）
          → [5] RRF 融合（k=60, top-rank bonus）
            → [6] LLM Re-ranking（相關性評分 0.0–1.0）
              → [7] Position-Aware Blending
                → [8] 結果豐富化 + Context 附帶
```

無 LLM 時，管線自動降級為 [1] → [5] → [8]（RRF-only）。

---

## 快速開始

### 前置需求

- **Node.js** 18+
- **OPENAI_API_KEY** 環境變數（用於向量嵌入，或設定 Ollama 等本地替代方案）

### 安裝方式

#### 方式 A：Claude Code Plugin Marketplace（推薦）

```bash
# 1. 在 Claude Code 中安裝 plugin（自動設定 MCP Server + Skills）
/plugin marketplace add jane11519/ProjectMemory
/plugin install projmem@ProjectMemory

# 2. 初始化 vault 目錄結構與資料庫
npx projmem init
```

#### 方式 B：手動安裝

```bash
# 1. 初始化（自動建立 vault、DB、hooks、.mcp.json）
npx projmem init

# MCP server 已自動設定到 .mcp.json
# 重啟 Claude Code 即可使用
```

#### 方式 C：全域安裝 + MCP 手動註冊

```bash
npm install -g projmem
npx projmem init
claude mcp add --transport stdio projmem -- projmem mcp
```

> **Windows 注意事項**：若 `npx` 直接執行 MCP server 出現問題，可改用 `cmd /c npx` wrapper：
> ```json
> { "command": "cmd", "args": ["/c", "npx", "-y", "projmem", "mcp"] }
> ```

### 典型工作流程

```bash
# 1. 設定 API Key
export OPENAI_API_KEY="sk-..."

# 2. 在 vault/code-notes/ 新增 Markdown 筆記

# 3. 建立搜尋索引
npx projmem index build

# 4. 搜尋知識庫
npx projmem search "authentication flow" --format json

# 5. Deep Search（完整管線）
npx projmem search "auth architecture" --mode deep --format json

# 6. 啟動 MCP Server
npx projmem mcp
```

---

## CLI 指令參考

所有指令皆支援 `--repo-root <path>`（預設 `.`）與 `--format <json|text>`（預設 `text`）。

### 搜尋

```bash
# 混合搜尋（預設 RRF 融合）
npx projmem search "JWT token" --format json

# Deep Search（Query Expansion + RRF + Re-ranking）
npx projmem search "authentication" --mode deep --format json

# 跳過 expansion 或 re-ranking
npx projmem search "auth" --mode deep --skip-expansion
npx projmem search "auth" --mode deep --skip-reranking

# 指定搜尋模式
npx projmem search "error" --mode bm25_only   # 僅 BM25
npx projmem search "error" --mode vec_only    # 僅向量

# 展開單一 chunk
npx projmem search expand 42 --format json

# 整份文件
npx projmem search full "code-notes/auth.md" --format json
```

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--top-k <number>` | 回傳結果數量 | `10` |
| `--namespace <id>` | 依命名空間 ID 過濾 | 全部 |
| `--mode <mode>` | `hybrid`、`bm25_only`、`vec_only`、`deep` | `hybrid` |
| `--level <level>` | `brief`、`normal`、`full` | `normal` |
| `--skip-expansion` | 跳過 Query Expansion | `false` |
| `--skip-reranking` | 跳過 LLM Re-ranking | `false` |

### 索引

```bash
npx projmem index build     # 全量重建
npx projmem index update    # 增量更新（dirty files）
```

### Session

```bash
npx projmem session save --session-id "session-abc"
npx projmem session compact --session-id "session-abc"
npx projmem session list
npx projmem session capture    # 擷取 Claude Code transcript
# /session-summarize              # Claude Code Skill：生成結構化摘要
```

### Context

```bash
# 新增 context metadata
npx projmem context add "code-notes/services/auth" "Authentication: JWT, OAuth2, RBAC"

# 列出所有 contexts
npx projmem context list

# 檢查路徑的 applicable contexts（含階層繼承）
npx projmem context check "code-notes/services/auth/jwt.md"

# 移除 context
npx projmem context rm "code-notes/services/auth"
```

### MCP Server

```bash
# stdio 模式（Claude Code 預設）
npx projmem mcp

# HTTP/SSE 模式（daemon）
npx projmem mcp --http --port 8181
```

### 其他

```bash
npx projmem scan             # 偵測命名空間與文件
npx projmem health           # 檢查索引一致性
npx projmem health --fix     # 自動修復
npx projmem init             # 初始化專案
```

---

## MCP Server

projmem 可作為 MCP server 運行，提供 9 個工具供 LLM client 使用。

### MCP 工具

| MCP Tool | 對應 CLI | 適用場景 |
|----------|----------|----------|
| `projmem_search` | `search --mode bm25_only` | 已知關鍵字、精確術語 |
| `projmem_vector_search` | `search --mode vec_only` | 語意查詢、概念搜尋 |
| `projmem_deep_search` | `search --mode deep` | 複雜研究、多面向查詢 |
| `projmem_get` | `search expand <id>` | 取回特定 chunk 或文件 |
| `projmem_multi_get` | — | 批量取回多個項目 |
| `projmem_status` | `health` | 索引統計與健康狀態 |
| `projmem_session_list` | `session list` | 列出 sessions（含 summary 狀態過濾） |
| `projmem_session_transcript` | — | 讀取完整對話 transcript |
| `projmem_session_update_summary` | — | 儲存 Claude 生成的結構化摘要 |

### Claude Code 設定

`npx projmem init` 會自動在專案根目錄建立 `.mcp.json`，團隊成員可透過版本控制共享此設定：

```json
{
  "mcpServers": {
    "projmem": {
      "command": "npx",
      "args": ["-y", "projmem", "mcp"]
    }
  }
}
```

或手動在 `.claude/settings.json` 中加入相同設定。

### 分數解讀

| 分數範圍 | 意義 | 建議動作 |
|----------|------|----------|
| 0.8 – 1.0 | 高度相關 | 直接回答查詢 |
| 0.5 – 0.8 | 中度相關 | 包含相關資訊 |
| 0.2 – 0.5 | 低度相關 | 僅略讀 |
| < 0.2 | 不相關 | 跳過 |

---

## 搜尋演算法

### RRF 融合（Reciprocal Rank Fusion）

預設融合方式（取代舊版線性加權）。使用排名而非原始分數進行融合，不受量級差異影響：

```
score = Σ(weight / (k + rank + 1))
```

- **k = 60** — 平滑常數
- **原始查詢 2× 權重** — 擴展查詢 1× 權重
- **Top-rank bonus** — #1 +0.05、#2-3 +0.02

### Position-Aware Blending

```
ranks 1-3:   finalScore = 0.75 × rrfScore + 0.25 × rerankerScore
ranks 4-10:  finalScore = 0.60 × rrfScore + 0.40 × rerankerScore
ranks 11+:   finalScore = 0.40 × rrfScore + 0.60 × rerankerScore
```

### 強訊號偵測

當 BM25 最高分與第二高分差距 ≥ 0.15 時，跳過 Query Expansion 以節省 LLM 呼叫。

### 向後相容

設定 `search.fusionMethod: 'linear'` 可恢復舊版線性加權融合（BM25 × 0.7 + Vector × 0.3）。

---

## 設定

透過 `.projmem.json` 設定。合併優先順序：**預設值 < 設定檔 < 程式碼覆蓋值**。

### 使用 Ollama 本地服務

```json
{
  "embedding": {
    "provider": "openai",
    "baseUrl": "http://localhost:11434/v1",
    "model": "nomic-embed-text",
    "dimension": 768
  },
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:11434/v1",
    "model": "qwen3:1.7b",
    "rerankerModel": "qwen3:0.6b"
  }
}
```

### 使用 LocalAI（專用 Reranker + Embedding + Chat）

透過 LocalAI 統一提供三個模型服務，使用 `/v1/rerank` endpoint 呼叫 cross-encoder reranker。

#### 1. 啟動 LocalAI Docker

```bash
# 建立模型目錄
mkdir -p localai-models

# 啟動 LocalAI（CPU 版，含 API Key 保護）
docker run -d --name localai \
  -p 8080:8080 \
  -v ./localai-models:/build/models \
  -e API_KEY=sk-projmem-secret-123 \
  -e THREADS=4 \
  localai/localai:latest-cpu
```

若有 NVIDIA GPU，改用 GPU 版加速推論：

```bash
docker run -d --name localai \
  -p 8080:8080 \
  -v ./localai-models:/build/models \
  -e API_KEY=sk-projmem-secret-123 \
  -e THREADS=4 \
  --gpus all \
  localai/localai:latest-gpu-nvidia-cuda-12
```

#### 2. 安裝模型

```bash
# Embedding 模型
curl http://localhost:8080/models/apply -H "Authorization: Bearer sk-projmem-secret-123" \
  -d '{"url": "huggingface://lm-kit/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf", "name": "embeddinggemma-300M-Q8_0", "backend": "llama-cpp"}'

# Query Expansion 模型（chat）
curl http://localhost:8080/models/apply -H "Authorization: Bearer sk-projmem-secret-123" \
  -d '{"url": "huggingface://lm-kit/qmd-query-expansion-1.7B-GGUF/qmd-query-expansion-1.7B-q4_k_m.gguf", "name": "qmd-query-expansion-1.7B-q4_k_m", "backend": "llama-cpp"}'

# Reranker 模型（cross-encoder → /v1/rerank）
curl http://localhost:8080/models/apply -H "Authorization: Bearer sk-projmem-secret-123" \
  -d '{"url": "huggingface://lm-kit/qwen3-reranker-0.6B-GGUF/qwen3-reranker-0.6b-q8_0.gguf", "name": "qwen3-reranker-0.6b-q8_0", "backend": "llama-cpp"}'
```

#### 3. 驗證端點

```bash
# Embedding
curl http://localhost:8080/v1/embeddings \
  -H "Authorization: Bearer sk-projmem-secret-123" \
  -d '{"model":"embeddinggemma-300M-Q8_0","input":"test"}'

# Query Expansion（chat completions）
curl http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-projmem-secret-123" \
  -d '{"model":"qmd-query-expansion-1.7B-q4_k_m","messages":[{"role":"user","content":"ping"}]}'

# Reranker（/v1/rerank endpoint）
curl http://localhost:8080/v1/rerank \
  -H "Authorization: Bearer sk-projmem-secret-123" \
  -d '{"model":"qwen3-reranker-0.6b-q8_0","query":"auth","documents":["JWT login","avatar upload"]}'
```

#### 4. `.projmem.json` 設定

```json
{
  "embedding": {
    "provider": "openai",
    "baseUrl": "http://localhost:8080/v1",
    "apiKey": "sk-projmem-secret-123",
    "model": "embeddinggemma-300M-Q8_0",
    "dimension": 256
  },
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "http://localhost:8080/v1",
    "apiKey": "sk-projmem-secret-123",
    "model": "qmd-query-expansion-1.7B-q4_k_m",
    "rerankerModel": "qwen3-reranker-0.6b-q8_0",
    "rerankerStrategy": "endpoint"
  }
}
```

> **`rerankerStrategy`**：`"chat"`（預設）透過 chat completions 請模型以 JSON 評分；`"endpoint"` 透過 `/v1/rerank` API 呼叫專用 cross-encoder reranker（Jina/Cohere/LocalAI 格式）。

### 使用 OpenAI

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimension": 1536
  },
  "llm": {
    "provider": "openai-compatible",
    "model": "gpt-4o-mini"
  }
}
```

### 完整設定結構

```jsonc
{
  "version": 1,
  "vault": {
    "root": "vault",
    "folders": ["code-notes", "rules", "integrations", "sessions", "structure"]
  },
  "index": {
    "dbPath": "vault/.projmem/index.db",
    "dirtyFilePath": "vault/.projmem/dirty-files.txt",
    "auditLogPath": "vault/.projmem/audit.log"
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimension": 1536,
    "maxBatchSize": 100,
    "apiKey": "",
    "baseUrl": ""
  },
  "search": {
    "defaultTopK": 10,
    "candidateMultiplier": 5,
    "weights": { "lexical": 0.7, "vector": 0.3 },
    "fts5FieldWeights": {
      "title": 8.0, "headingPath": 4.0, "body": 1.0,
      "tags": 2.0, "properties": 3.0
    },
    "fusionMethod": "rrf",           // "rrf" 或 "linear"
    "rrfK": 60,
    "strongSignalMinScore": 0.85,
    "strongSignalMinGap": 0.15,
    "rerankCandidateLimit": 20,
    "rerankBlending": {
      "topRrfWeight": 0.75,
      "midRrfWeight": 0.60,
      "tailRrfWeight": 0.40
    }
  },
  "llm": {
    "provider": "none",              // "openai-compatible" 或 "none"
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "rerankerModel": "",             // 可選，預設使用 model
    "rerankerStrategy": "chat",      // "chat" 或 "endpoint"（/v1/rerank）
    "cacheTTLMs": 3600000            // LLM 快取 TTL（1 小時）
  },
  "chunking": { "maxTokensPerChunk": 512, "overlapLines": 2 },
  "session": { "autoSaveAfterTurns": 10, "compactTokenThreshold": 20000 },
  "namespacePatterns": ["services/*", "packages/*", "apps/*", "libs/*", "modules/*"]
}
```

### 環境變數

| 變數 | 說明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API Key（用於嵌入與 LLM，除非設定檔已提供） |

### Embedding 維度遷移

切換 embedding model 導致維度不同時：

1. `DatabaseManager` 啟動時偵測維度不符
2. 拒絕啟動並提示 `"Run projmem reindex --force"`
3. `reindex --force` 刪除向量表並重新嵌入所有 chunks

---

## Context 系統

階層式 context metadata，使用虛擬路徑 scheme：

```
projmem://code-notes/services/auth
```

**階層繼承**：查詢 `code-notes/services/auth/jwt.md` 時，會回傳 `auth`、`services`、`code-notes` 所有祖先的 context。搜尋結果自動附帶 applicable contexts。

---

## Vault 目錄結構

```
vault/
├── code-notes/          # 架構設計、設計決策、程式碼說明
├── rules/               # 專案規範與慣例
├── integrations/        # 第三方整合文件
├── sessions/            # 自動產生的 Session Markdown 檔案
├── structure/           # 目錄地圖、依賴圖
└── .projmem/
    ├── index.db         # SQLite 資料庫（FTS5 + vec0 + llm_cache）
    ├── dirty-files.txt  # 已修改檔案路徑
    └── audit.log        # 索引操作審計日誌
```

---

## Claude Code 整合

### SKILL.md 觸發詞

SKILL.md 位於 `.claude/skills/projmem/SKILL.md`，觸發詞包含：`project knowledge`、`code explanation`、`search`、`find in notes`、`session`、`what do we know about`。

### Hook 腳本

| Hook 事件 | 說明 | 超時 |
|-----------|------|------|
| `PostToolUse`（Write/Edit） | 追蹤修改過的 vault 檔案 | 5s |
| `TaskCompleted` | 增量索引 + 儲存 session | 120s |
| `Stop` | 儲存最終 session 狀態 | 60s |

---

## 開發

### NPM 腳本

| 指令 | 說明 |
|------|------|
| `npm run build` | 編譯 TypeScript |
| `npm run dev` | 監看模式編譯 |
| `npm test` | 執行所有測試（155 tests） |
| `npm run test:unit` | 僅單元測試 |
| `npm run test:integration` | 僅整合測試 |
| `npm run test:coverage` | 覆蓋率報告 |
| `npm run lint` | TypeScript 型別檢查 |

### 測試結構

```
tests/
├── unit/
│   ├── config/          # ConfigLoader
│   ├── domain/          # ContentHash, HybridScore, RRFScore,
│   │                    # StrongSignal, DomainErrors, SessionSummary
│   ├── shared/          # RetryPolicy
│   ├── infrastructure/  # MarkdownParser, ChunkingStrategy,
│   │                    # GitModulesParser, EmbeddingBatcher, HttpLLMAdapter
│   ├── mcp/             # SessionTools
│   └── application/     # HealthCheckUseCase, ContextUseCase
└── integration/
    ├── sqlite-setup, fts5-adapter, sqlite-vec-adapter
    ├── vault-adapter, scan-use-case
    ├── index-use-case, hybrid-search
    ├── session-use-case
    └── mcp-server
```

### 覆蓋率目標

- **Lines** ≥ 80%、**Branches** ≥ 75%
- 範圍：`src/**/*.ts`（排除 `src/cli/**`）

---

## 技術棧

### 執行期依賴

| 套件 | 用途 |
|------|------|
| `better-sqlite3` | SQLite 同步驅動（WAL mode） |
| `sqlite-vec` | 向量 KNN 搜尋（vec0 虛擬表） |
| `openai` | OpenAI-compatible API 客戶端（嵌入 + LLM） |
| `@modelcontextprotocol/sdk` | MCP 協定實作 |
| `zod` | MCP schema validation |
| `commander` | CLI 框架 |
| `gray-matter` | YAML frontmatter 解析 |

### 開發依賴

| 套件 | 用途 |
|------|------|
| `typescript` | TypeScript 編譯器（strict mode） |
| `vitest` | 測試框架 |
| `@vitest/coverage-v8` | 覆蓋率 |
| `@types/better-sqlite3` | 型別定義 |
| `@types/node` | Node.js 型別定義 |

---

## 資料庫 Schema

| 表名 | 用途 |
|------|------|
| `schema_meta` | Schema 版本 + embedding 維度記錄 |
| `namespaces` | Root / submodule / directory 命名空間 |
| `docs` | 已索引的 Markdown 文件 |
| `chunks` | Heading-based 文字區塊 |
| `chunks_fts` | FTS5 虛擬表（BM25 搜尋） |
| `chunks_vec` | vec0 虛擬表（向量 KNN 搜尋） |
| `sessions` | Session 狀態 |
| `llm_cache` | LLM 回應快取（query expansion + reranking） |
| `path_contexts` | 階層式 context metadata |
| `audit_log` | 索引操作審計 |

---

## 專案結構

```
projmem/
├── src/
│   ├── config/              # 設定型別、預設值、載入器
│   ├── domain/
│   │   ├── entities/        # Document, Chunk, Namespace, Session,
│   │   │                    # SearchResult, PathContext
│   │   ├── value-objects/   # ContentHash, HybridScore, RRFScore, StrongSignal
│   │   ├── errors/          # DomainErrors（retryable/degradable/manual）
│   │   └── ports/           # EmbeddingPort, IndexPort, LLMPort,
│   │                        # VaultPort, SessionPort
│   ├── application/         # Use Cases + DTOs
│   │   ├── SearchUseCase    # 多階段搜尋管線
│   │   ├── ContextUseCase   # 階層式 context CRUD
│   │   └── ...              # Index, Scan, Session, HealthCheck
│   ├── infrastructure/
│   │   ├── sqlite/          # DatabaseManager, FTS5, SqliteVec, Schema
│   │   ├── embedding/       # OpenAIEmbeddingAdapter, Batcher
│   │   ├── llm/             # HttpLLMAdapter, NullLLMAdapter
│   │   ├── vault/           # FileSystem, MarkdownParser, Chunking
│   │   └── session/         # VaultSessionAdapter
│   ├── mcp/
│   │   ├── McpServer.ts     # Server factory + instructions
│   │   ├── tools/           # 9 MCP tool handlers
│   │   └── transports/      # Stdio + HTTP/SSE
│   └── cli/
│       ├── commands/         # scan, index, search, session,
│       │                     # health, init, mcp, context
│       └── formatters/       # ProgressiveDisclosureFormatter
├── tests/                    # unit/ + integration/（155 tests）
├── assets/skill/             # SKILL.md 模板
├── .claude/                  # Claude Code 整合
└── vault/                    # Obsidian 知識庫
```

---

## 授權

MIT
