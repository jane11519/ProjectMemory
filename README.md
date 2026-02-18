# ProjectHub

**專案級 Obsidian 知識庫，搭載混合 BM25+向量搜尋引擎，為 Claude Code 打造的專案技能（Project Skill）。**

![Node.js](https://img.shields.io/badge/Node.js-≥18.0.0-339933?logo=node.js)
![Tests](https://img.shields.io/badge/tests-68%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)

---

## 功能特色

- **混合搜尋（Hybrid Search）** — BM25 全文檢索（FTS5）搭配向量 KNN（sqlite-vec），以可配置權重融合排序
- **漸進式揭露（Progressive Disclosure）** — `brief` / `normal` / `full` 三級細節控制，節省 token 用量
- **優雅降級（Graceful Degradation）** — 向量服務不可用自動回退至 BM25；BM25 失敗自動回退至向量搜尋
- **Session 持久化** — SQLite 儲存 + Markdown 匯出至 vault，支援滾動摘要與壓縮
- **增量索引（Incremental Indexing）** — 以 SHA-256 內容雜湊偵測變更，僅重新索引有異動的文件
- **Claude Code Hooks 整合** — `PostToolUse`、`TaskCompleted`、`Stop` 自動化追蹤與更新
- **Monorepo / Submodule 命名空間** — 自動偵測 `.gitmodules` 與目錄樣式（`services/*`、`packages/*` 等）

---

## 架構概覽

ProjectHub 採用 **Clean Architecture / Hexagonal Architecture**，從內到外分為四層：

```
┌─────────────────────────────────────────────────┐
│                    CLI Layer                     │
│         commander · ProgressiveDisclosure        │
├─────────────────────────────────────────────────┤
│               Application Layer                  │
│   ScanUseCase · IndexUseCase · SearchUseCase     │
│   SessionUseCase · HealthCheckUseCase            │
├─────────────────────────────────────────────────┤
│             Infrastructure Layer                 │
│  SQLite (better-sqlite3) · FTS5 · sqlite-vec     │
│  OpenAI Embedding · FileSystem Vault · Session   │
├─────────────────────────────────────────────────┤
│                 Domain Layer                     │
│  Entities: Document, Chunk, Namespace, Session   │
│  Value Objects: ContentHash, HybridScore         │
│  Ports: EmbeddingPort, IndexPort, VaultPort      │
└─────────────────────────────────────────────────┘
```

### 資料流

```
Vault (Markdown + Frontmatter)
  → MarkdownParser (gray-matter 解析)
    → ChunkingStrategy (依 heading 切分)
      → OpenAI Embedding (text-embedding-3-small)
        → SQLite Index (FTS5 + vec0)
          → HybridScore Fusion (BM25 × 0.7 + KNN × 0.3)
            → Progressive Disclosure (brief / normal / full)
```

---

## 快速開始

### 前置需求

- **Node.js** 18+
- **OPENAI_API_KEY** 環境變數（用於向量嵌入）

### 安裝與建置

```bash
# 安裝依賴
npm install

# 編譯 TypeScript
npm run build
```

### 初始化 Vault

```bash
bash .claude/skills/projecthub/scripts/init-vault.sh
```

此腳本會：
1. 建立 `vault/` 目錄結構（`code-notes/`、`rules/`、`integrations/`、`sessions/`、`structure/`）
2. 建立 `vault/.projecthub/` 目錄
3. 初始化 SQLite 資料庫
4. 建立 `vault/.gitignore`（排除資料庫與暫存檔）
5. 建立 `.projecthub.json`（若不存在）

---

## 安裝到其他專案

### 方式一：npm 安裝（推薦）

```bash
# 安裝 npm 包
npm install projecthub

# 一鍵初始化（安裝 skill 檔案、hooks、vault 目錄、資料庫）
npx projecthub init
```

### 方式二：Git URL

```bash
npm install git+https://github.com/user/projecthub.git
npx projecthub init
```

### init 指令選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--repo-root <path>` | 目標專案根目錄 | `.` |
| `--force` | 覆寫已存在的 skill 檔案 | `false` |
| `--skip-db` | 跳過資料庫初始化 | `false` |
| `--format <format>` | 輸出格式：`json` 或 `text` | `text` |

### 安裝後的使用方式

```bash
# 在 Claude Code 中使用 /projecthub 斜線指令
# 或直接執行 CLI：
npx projecthub scan
npx projecthub index build
npx projecthub search "your query"
```

---

### 典型工作流程

```bash
# 1. 在 vault/code-notes/ 新增 Markdown 筆記
#    （支援 YAML frontmatter）

# 2. 設定 API Key
export OPENAI_API_KEY="sk-..."

# 3. 掃描 vault 與偵測命名空間
npx projecthub scan --repo-root .

# 4. 建立搜尋索引（全量）
npx projecthub index build --repo-root .

# 5. 搜尋知識庫
npx projecthub search "authentication flow" --format json
```

---

## CLI 指令參考

所有指令皆支援 `--repo-root <path>`（預設 `.`）與 `--format <json|text>`（預設 `text`）。

### `projecthub scan`

掃描 vault 與專案目錄，偵測命名空間與文件清單。

```bash
npx projecthub scan --repo-root . --format json
```

### `projecthub index build`

全量重建搜尋索引（FTS5 + 向量嵌入）。

```bash
npx projecthub index build --repo-root . --format json
```

> 注意：會清除現有索引後重建。exit code 為 1 時表示嵌入過程有部分失敗。

### `projecthub index update`

增量更新：僅處理 `dirty-files.txt` 中記錄的已變更文件。

```bash
npx projecthub index update --repo-root . --format json

# 指定自定義 dirty file 路徑
npx projecthub index update --dirty-file path/to/dirty.txt
```

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--dirty-file <path>` | dirty files 清單路徑 | `vault/.projecthub/dirty-files.txt` |

### `projecthub search <query>`

混合搜尋知識庫。

```bash
# 預設搜尋（normal 級別）
npx projecthub search "JWT token validation" --format json

# Brief 級別（僅 title + score，適合 inline prompt）
npx projecthub search "authentication" --level brief --format json

# 指定命名空間與結果數量
npx projecthub search "database schema" --namespace 2 --top-k 5

# 強制使用特定搜尋模式
npx projecthub search "error handling" --mode bm25_only
```

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--top-k <number>` | 回傳結果數量 | `10` |
| `--namespace <id>` | 依命名空間 ID 過濾 | 全部 |
| `--mode <mode>` | 搜尋模式：`hybrid`、`bm25_only`、`vec_only` | `hybrid` |
| `--level <level>` | 細節級別：`brief`、`normal`、`full` | `normal` |

### `projecthub search expand <chunkId>`

展開單一 chunk 的完整文字內容。

```bash
npx projecthub search expand 42 --format json
```

### `projecthub search full <docPath>`

顯示整份文件的所有 chunks。

```bash
npx projecthub search full "code-notes/auth.md" --format json
```

### `projecthub session save`

儲存目前的 session 狀態（SQLite + Markdown 匯出）。

```bash
npx projecthub session save --session-id "session-abc" --format json
```

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--session-id <id>` | Session 識別碼 | `session-<timestamp>` |
| `--project-dir <path>` | 專案目錄 | `--repo-root` 的值 |

### `projecthub session compact`

壓縮 session 的滾動摘要（超過 token 門檻時截斷至句子邊界）。

```bash
npx projecthub session compact --session-id "session-abc" --format json
```

| 選項 | 說明 | 必填 |
|------|------|------|
| `--session-id <id>` | 要壓縮的 Session ID | 是 |

### `projecthub session list`

列出所有活躍的 sessions。

```bash
npx projecthub session list --format json
```

### `projecthub health`

檢查索引健康狀態與一致性。

```bash
# 僅檢查
npx projecthub health --format json

# 檢查並自動修復
npx projecthub health --fix --format json
```

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--fix` | 嘗試自動修復問題 | `false` |

---

## 設定

ProjectHub 透過專案根目錄的 `.projecthub.json` 進行設定。設定值的合併優先順序：**預設值 < 設定檔 < 程式碼覆蓋值**。

### 完整設定結構

```jsonc
{
  "version": 1,
  "vault": {
    "root": "vault",                  // Vault 根目錄（相對於 repo root）
    "folders": [                       // Vault 子目錄
      "code-notes", "rules", "integrations", "sessions", "structure"
    ]
  },
  "index": {
    "dbPath": "vault/.projecthub/index.db",          // SQLite 資料庫路徑
    "dirtyFilePath": "vault/.projecthub/dirty-files.txt",  // dirty files 清單
    "auditLogPath": "vault/.projecthub/audit.log"    // 審計日誌路徑
  },
  "embedding": {
    "provider": "openai",              // 嵌入提供者（openai | local）
    "model": "text-embedding-3-small", // 嵌入模型
    "dimension": 1536,                 // 向量維度
    "maxBatchSize": 100,               // 批次嵌入上限
    "apiKey": "",                      // API Key（優先於環境變數）
    "baseUrl": ""                      // 自訂 API base URL（相容 OpenAI 介面）
  },
  "search": {
    "defaultTopK": 10,                 // 預設回傳結果數
    "candidateMultiplier": 5,          // 候選倍率（取 topK × 此值再排序）
    "weights": {
      "lexical": 0.7,                  // BM25 權重（兩者須總和為 1.0）
      "vector": 0.3                    // 向量權重
    },
    "fts5FieldWeights": {
      "title": 8.0,                    // 標題權重
      "headingPath": 4.0,              // 標題路徑權重
      "body": 1.0,                     // 正文權重
      "tags": 2.0,                     // 標籤權重
      "properties": 3.0                // frontmatter 屬性權重
    }
  },
  "chunking": {
    "maxTokensPerChunk": 512,          // 每個 chunk 的最大 token 數
    "overlapLines": 2                  // chunk 間重疊行數
  },
  "session": {
    "autoSaveAfterTurns": 10,          // 每 N 次互動自動儲存
    "compactTokenThreshold": 20000     // 觸發壓縮的 token 門檻
  },
  "namespacePatterns": [               // 命名空間偵測 glob 樣式
    "services/*", "packages/*", "apps/*", "libs/*", "modules/*"
  ]
}
```

### 環境變數

| 變數 | 說明 | 必填 |
|------|------|------|
| `OPENAI_API_KEY` | OpenAI API Key，用於向量嵌入 | 是（除非設定檔中已提供 `embedding.apiKey`） |

---

## Vault 目錄結構

```
vault/
├── code-notes/          # 架構設計、設計決策、程式碼說明
├── rules/               # 專案規範與慣例
├── integrations/        # 第三方整合文件
├── sessions/            # 自動產生的 Session Markdown 檔案
├── structure/           # 目錄地圖、依賴圖
└── .projecthub/
    ├── index.db         # SQLite 資料庫（FTS5 + vec0）
    ├── dirty-files.txt  # 已修改檔案路徑（供增量索引使用）
    └── audit.log        # 索引操作審計日誌
```

### 文件格式

所有文件皆為 Markdown，支援 YAML frontmatter：

```markdown
---
title: "Authentication Service"
tags: [auth, jwt, security]
ref_code_path: "src/auth/"
---

# Authentication Service

此處撰寫內容...
```

### 命名空間偵測規則

| 類型 | 偵測方式 | 說明 |
|------|----------|------|
| `root` | 永遠存在 | 預設命名空間 |
| `submodule` | 解析 `.gitmodules` | Git submodule 自動偵測 |
| `directory` | 比對 `namespacePatterns` | 如 `services/*`、`packages/*` 等 glob 樣式 |

---

## 搜尋演算法

### 混合融合（Hybrid Fusion）

ProjectHub 的搜尋引擎結合兩種互補的檢索策略：

1. **BM25（詞彙檢索）** — 透過 FTS5 全文索引，對各欄位套用不同權重
2. **KNN（向量檢索）** — 透過 sqlite-vec 計算餘弦相似度，公式 `1 / (1 + distance)`
3. **正規化** — Per-query max normalization（各自除以該次搜尋的最大值）
4. **融合** — `finalScore = lexWeight × lexNorm + vecWeight × vecNorm`

### FTS5 欄位權重

| 欄位 | 權重 | 說明 |
|------|------|------|
| `title` | 8.0 | 文件標題 |
| `headingPath` | 4.0 | Heading 路徑（如 `# Auth > ## JWT`） |
| `properties` | 3.0 | Frontmatter 屬性 |
| `tags` | 2.0 | 標籤 |
| `body` | 1.0 | 正文內容 |

### 候選倍率（Candidate Multiplier）

預設 `5×` — 從 BM25 與向量引擎各取 `topK × 5` 筆候選，融合排序後截取前 `topK` 筆。

### 降級模式

| 模式 | 觸發條件 | 行為 |
|------|----------|------|
| `hybrid` | 預設 | BM25 + 向量雙引擎 |
| `bm25_only` | 向量服務失敗 或 使用者指定 | 僅詞彙檢索 |
| `vec_only` | BM25 失敗 或 使用者指定 | 僅向量檢索 |

自動降級邏輯：`hybrid` 模式下若向量失敗 → 自動切換 `bm25_only`；若 BM25 失敗 → 自動切換 `vec_only`。

### FTS5 查詢安全處理

每個查詢 token 會以雙引號包裹，防止 FTS5 特殊字元（如 `-` 被解讀為 NOT 運算子）造成語法錯誤。

---

## Session 管理

### 生命週期

```
active  →  compacted  →  closed
  │            │
  │  超過 token 門檻時壓縮
  │
  每次互動累積 turn count、decisions、search footprint
```

- **active** — Session 進行中，持續累積互動記錄
- **compacted** — 滾動摘要已壓縮以減少 token 用量
- **closed** — Session 結束

### Session 資料模型

| 欄位 | 類型 | 說明 |
|------|------|------|
| `session_id` | TEXT | 唯一識別碼 |
| `project_dir` | TEXT | 專案根目錄路徑 |
| `turn_count` | INTEGER | 互動輪次數 |
| `rolling_summary` | TEXT | 累積上下文摘要 |
| `decisions_json` | TEXT | 架構決策紀錄（JSON 陣列） |
| `search_footprint_json` | TEXT | 搜尋查詢紀錄（JSON 陣列） |
| `status` | TEXT | `active` / `compacted` / `closed` |

### Markdown 匯出格式

每次儲存時會寫入 `vault/sessions/<date>_<session_id>.md`：

```markdown
---
session_id: "session-abc"
project_dir: "/path/to/project"
turn_count: 15
status: "active"
---

## Rolling Summary

（累積的上下文摘要）

## Decisions

- 決策 1
- 決策 2

## Search Footprint

- `authentication flow`
- `JWT token validation`
```

### 壓縮策略

當滾動摘要超過 token 門檻（預設 20,000）時：

1. 截斷至 500 字元的最近句子邊界
2. 狀態更新為 `compacted`
3. 重新匯出 Markdown 檔案

---

## Claude Code 整合

ProjectHub 被設計為 Claude Code 的專案技能（Project Skill），透過 SKILL.md 與 Hook 腳本實現自動化整合。

### SKILL.md 觸發詞

SKILL.md 位於 `.claude/skills/projecthub/SKILL.md`，定義以下觸發詞：

- `project knowledge`
- `code explanation`
- `search`
- `find in notes`
- `session`
- `what do we know about`

當使用者提及這些詞彙時，Claude Code 會自動載入此技能。

### Hook 腳本

Hook 設定定義在 `.claude/settings.json`：

| Hook 事件 | 腳本 | 說明 | 超時 |
|-----------|------|------|------|
| `PostToolUse`（Write/Edit） | `track-dirty.sh` | 追蹤修改過的 vault Markdown 檔案至 dirty-files.txt | 5s |
| `TaskCompleted` | `on-task-completed.sh` | 增量更新索引 + 儲存 session 狀態 | 120s |
| `Stop` | `on-stop.sh` | 對話結束時儲存最終 session 狀態 | 60s（非同步） |

### 自動化工作流程

```
使用者編輯 vault/*.md
  → PostToolUse hook 記錄 dirty file
    → TaskCompleted hook 觸發增量索引
      → 同時自動儲存 session 狀態

對話結束
  → Stop hook 儲存最終 session 狀態
```

---

## 開發

### NPM 腳本

| 指令 | 說明 |
|------|------|
| `npm run build` | 編譯 TypeScript（`tsc`） |
| `npm run dev` | 監看模式編譯（`tsc --watch`） |
| `npm test` | 執行所有測試（`vitest run`） |
| `npm run test:watch` | 監看模式測試（`vitest`） |
| `npm run test:unit` | 僅執行單元測試 |
| `npm run test:integration` | 僅執行整合測試 |
| `npm run test:coverage` | 執行測試並產生覆蓋率報告 |
| `npm run lint` | TypeScript 型別檢查（`tsc --noEmit`） |

### 測試結構

```
tests/
├── unit/
│   ├── config/          # ConfigLoader 測試
│   ├── domain/          # 領域物件（ContentHash、HybridScore、DomainErrors）
│   ├── shared/          # 共用工具（RetryPolicy）
│   ├── infrastructure/  # 基礎設施（MarkdownParser、ChunkingStrategy、
│   │                    #   GitModulesParser、EmbeddingBatcher）
│   └── application/     # 應用層（HealthCheckUseCase）
└── integration/
    ├── sqlite-setup     # SQLite 資料庫初始化
    ├── fts5-adapter     # FTS5 全文搜尋
    ├── sqlite-vec-adapter  # sqlite-vec 向量搜尋
    ├── vault-adapter    # 檔案系統 Vault 操作
    ├── scan-use-case    # 掃描用例
    ├── index-use-case   # 索引用例
    ├── hybrid-search    # 混合搜尋端對端
    └── session-use-case # Session 管理
```

### 覆蓋率目標

- **Lines** ≥ 80%
- **Branches** ≥ 75%
- 覆蓋範圍：`src/**/*.ts`（排除 `src/cli/**`）
- 測試框架：Vitest + v8 coverage provider

---

## 技術棧

### 執行期依賴

| 套件 | 用途 |
|------|------|
| `better-sqlite3` | SQLite 同步資料庫驅動（WAL mode） |
| `sqlite-vec` | sqlite-vec 擴充 — vec0 虛擬表支援向量 KNN 搜尋 |
| `gray-matter` | YAML frontmatter 解析 |
| `commander` | CLI 指令框架 |
| `openai` | OpenAI API 客戶端（向量嵌入） |

### 開發依賴

| 套件 | 用途 |
|------|------|
| `typescript` | TypeScript 編譯器（strict mode） |
| `@types/better-sqlite3` | better-sqlite3 型別定義 |
| `@types/node` | Node.js 型別定義 |
| `vitest` | 測試框架 |
| `@vitest/coverage-v8` | v8 覆蓋率 provider |

---

## 資料庫 Schema

SQLite WAL mode，搭配 better-sqlite3 + sqlite-vec 擴充。

### 資料表

| 表名 | 用途 |
|------|------|
| `schema_meta` | Schema 版本與中繼資訊 |
| `namespaces` | Root / submodule / directory 命名空間 |
| `docs` | 已索引的 Markdown 文件（含 content_hash） |
| `chunks` | 基於 heading 切分的文字區塊（含行範圍） |
| `chunks_fts` | FTS5 contentless 虛擬表（BM25 搜尋） |
| `chunks_vec` | vec0 虛擬表（向量 KNN 搜尋） |
| `sessions` | Session 狀態（滾動摘要、決策、搜尋足跡） |
| `audit_log` | 索引操作審計軌跡 |

### 關聯關係

```
namespaces  1:N  docs       (namespace_id)
docs        1:N  chunks     (doc_id, CASCADE delete)
chunks.chunk_id = chunks_fts.rowid = chunks_vec.rowid
```

### 索引

- `idx_docs_namespace` / `idx_docs_content_hash` / `idx_docs_source_kind`
- `idx_chunks_doc_id` / `idx_chunks_text_hash`
- `idx_audit_timestamp` / `idx_audit_target`

---

## 專案結構

```
ProjectHub/
├── .claude/
│   ├── settings.json                    # Claude Code hooks 設定
│   └── skills/projecthub/
│       ├── SKILL.md                     # 技能定義（觸發詞、指令、參考）
│       ├── references/
│       │   ├── search-algorithm.md      # 搜尋演算法參考
│       │   ├── schema.md               # 資料庫 Schema 參考
│       │   ├── vault-conventions.md     # Vault 慣例參考
│       │   └── session-protocol.md      # Session 協議參考
│       └── scripts/
│           ├── init-vault.sh            # Vault 初始化腳本
│           ├── track-dirty.sh           # PostToolUse hook：追蹤 dirty files
│           ├── on-task-completed.sh     # TaskCompleted hook：增量索引 + session save
│           └── on-stop.sh              # Stop hook：儲存最終 session
├── src/
│   ├── config/
│   │   ├── types.ts                     # 設定型別定義
│   │   ├── defaults.ts                  # 預設設定值
│   │   └── ConfigLoader.ts             # 設定載入器（deep merge + validation）
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── Namespace.ts             # 命名空間實體
│   │   │   ├── Document.ts              # 文件實體
│   │   │   ├── Chunk.ts                 # 區塊實體
│   │   │   ├── SearchResult.ts          # 搜尋結果實體
│   │   │   └── Session.ts              # Session 實體
│   │   ├── value-objects/
│   │   │   ├── ContentHash.ts           # SHA-256 內容雜湊
│   │   │   └── HybridScore.ts          # 混合分數融合演算法
│   │   ├── errors/
│   │   │   └── DomainErrors.ts          # 領域錯誤定義
│   │   └── ports/
│   │       ├── EmbeddingPort.ts         # 嵌入服務埠（介面）
│   │       ├── IndexPort.ts             # 索引埠
│   │       ├── VaultPort.ts             # Vault 存取埠
│   │       └── SessionPort.ts          # Session 存取埠
│   ├── application/
│   │   ├── ScanUseCase.ts               # 掃描用例
│   │   ├── IndexUseCase.ts              # 索引用例（全量 + 增量）
│   │   ├── SearchUseCase.ts             # 混合搜尋用例
│   │   ├── SessionUseCase.ts            # Session 管理用例
│   │   ├── HealthCheckUseCase.ts        # 健康檢查用例
│   │   └── dto/
│   │       ├── IndexStats.ts            # 索引統計 DTO
│   │       ├── SearchRequest.ts         # 搜尋請求 DTO
│   │       ├── SearchResponse.ts        # 搜尋回應 DTO
│   │       └── SessionSnapshot.ts      # Session 快照 DTO
│   ├── infrastructure/
│   │   ├── sqlite/
│   │   │   ├── DatabaseManager.ts       # 資料庫管理器（初始化 + 擴充載入）
│   │   │   ├── schema.ts               # DDL Schema 定義
│   │   │   ├── FTS5Adapter.ts           # FTS5 全文搜尋適配器
│   │   │   └── SqliteVecAdapter.ts     # sqlite-vec 向量搜尋適配器
│   │   ├── vault/
│   │   │   ├── FileSystemVaultAdapter.ts  # 檔案系統 Vault 適配器
│   │   │   ├── MarkdownParser.ts        # Markdown + frontmatter 解析
│   │   │   ├── ChunkingStrategy.ts      # Heading-based 切分策略
│   │   │   └── GitModulesParser.ts     # .gitmodules 解析
│   │   ├── embedding/
│   │   │   ├── OpenAIEmbeddingAdapter.ts  # OpenAI 嵌入適配器
│   │   │   └── EmbeddingBatcher.ts     # 批次嵌入排程器
│   │   └── session/
│   │       └── VaultSessionAdapter.ts  # Session SQLite + Markdown 適配器
│   ├── shared/
│   │   ├── Logger.ts                    # 日誌工具
│   │   └── RetryPolicy.ts             # 重試策略
│   └── cli/
│       ├── index.ts                     # CLI 進入點（commander）
│       ├── commands/
│       │   ├── scan.ts                  # scan 指令
│       │   ├── index.ts                 # index build / update 指令
│       │   ├── search.ts               # search / expand / full 指令
│       │   ├── session.ts              # session save / compact / list 指令
│       │   └── health.ts              # health 指令
│       └── formatters/
│           └── ProgressiveDisclosureFormatter.ts  # 漸進式揭露格式化器
├── tests/
│   ├── unit/                            # 單元測試（無外部依賴）
│   └── integration/                    # 整合測試（含 SQLite）
├── vault/                              # Obsidian 知識庫（gitignore DB 檔案）
├── docs/plans/                          # 實作規劃文件
├── .projecthub.json                     # 專案設定檔
├── tsconfig.json                        # TypeScript 設定
├── vitest.config.ts                     # Vitest 測試設定
└── package.json                         # 專案定義與腳本
```

---

## 授權

MIT
