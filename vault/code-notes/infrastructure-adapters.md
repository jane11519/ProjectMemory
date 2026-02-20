---
title: "基礎設施層轉接器"
tags: [infrastructure, adapter, DatabaseManager, FTS5Adapter, SqliteVecAdapter, OpenAIEmbeddingAdapter, HttpLLMAdapter, NullLLMAdapter, FileSystemVaultAdapter, VaultSessionAdapter, TranscriptParser, EmbeddingBatcher, ChunkingStrategy, MarkdownParser, GitModulesParser]
source_kind: code_note
date: 2026-02-20
---

# 基礎設施層轉接器

## 概覽 Overview

Infrastructure 層實作 Domain 層定義的 Port 介面，將抽象操作對應到具體的技術實作。每個 Adapter 專注於單一外部依賴（SQLite、OpenAI API、檔案系統等）。

## DatabaseManager — 資料庫管理

`DatabaseManager` 負責 SQLite 資料庫的完整初始化生命週期。

### 初始化流程

```
1. 建立 better-sqlite3 Database 實例
2. 執行 PRAGMA 設定（WAL, busy_timeout, foreign_keys, cache_size）
3. 執行 SCHEMA_SQL（建立所有核心表與索引）
4. 載入 sqlite-vec 擴充套件
5. 讀取/驗證 embedding dimension：
   - 若 schema_meta 無記錄 → 寫入新 dimension
   - 若 schema_meta 有記錄且不一致 → 拋出錯誤
6. 建立 chunks_vec 虛擬表（使用驗證後的 dimension）
7. 建立並回傳 FTS5Adapter + SqliteVecAdapter 實例
```

### Dimension 防護機制

Embedding dimension 變更（例如從 `text-embedding-3-small` 的 1536 切換到 768）會導致向量查詢錯誤。`DatabaseManager` 透過 `schema_meta` 表追蹤 dimension，偵測不一致時拋出明確錯誤：
```
Error: Embedding dimension mismatch: stored=1536, configured=768.
Please rebuild the index.
```

## FTS5Adapter — 全文搜尋

實作 FTS5 contentless 虛擬表的 CRUD 和 BM25 搜尋。

### BM25 查詢

```typescript
searchBM25(query: string, topK: number, namespaceId?: number): Map<number, number>
```

- **查詢安全處理**：將 query 拆分為 token，每個 token 用雙引號包裹（`"token"`），防止 FTS5 特殊語法（`OR`、`NOT`、`*`）導致錯誤
- **加權 BM25**：使用 `bm25(chunks_fts, w_title, w_heading, w_body, w_tags, w_props)` 函式，權重來自設定
- **分數翻轉**：SQLite FTS5 的 `bm25()` 回傳負數（越小越相關），Adapter 將其翻轉為正數（越大越相關）
- **namespace 過濾**：透過 JOIN `chunks → docs` 表，依 `namespace_id` 過濾結果

## SqliteVecAdapter — 向量搜尋

封裝 sqlite-vec 擴充套件的 vec0 虛擬表操作。

### KNN 查詢

```typescript
searchKNN(queryVec: Float32Array, topK: number): Map<number, number>
```

- 使用 `WHERE embedding MATCH ? AND k = ?` 語法進行 KNN 搜尋
- `distance` 為 L2 距離（sqlite-vec 預設）
- 相似度轉換：`similarity = 1 / (1 + distance)`，結果正規化至 [0, 1]

### 資料寫入

`insertRows()` 將 `{chunkId, embedding}` 寫入 vec0 表。使用 `BigInt(chunkId)` 確保 SQLite INTEGER 型別正確綁定。`deleteRows()` 依 `rowid` 刪除向量資料。

## OpenAIEmbeddingAdapter — Embedding 實作

實作 `EmbeddingPort`，透過 OpenAI SDK 呼叫 Embedding API。

### 設定參數

| 參數 | 預設值 | 說明 |
|------|-------|------|
| `model` | `text-embedding-3-small` | Embedding 模型 |
| `dimension` | 1536 | 向量維度 |
| `maxBatchSize` | 100 | 每批請求的最大文字數 |
| `baseUrl` | `https://api.openai.com/v1` | API 端點（支援自訂） |

### 批次處理

`EmbeddingBatcher` 將大量文字分批處理，每批不超過 `maxBatchSize`。批次結果按原始順序重組，確保 chunkId 對應正確。

### 健康檢查

`isHealthy()` 嘗試嵌入一個短文字（`"test"`），成功回傳 `true`。用於 CLI `health` 指令和 MCP status 報告。

## HttpLLMAdapter — LLM 服務

實作 `LLMPort`，透過 OpenAI-compatible API 提供 Query Expansion 和 Re-ranking。

### Query Expansion

呼叫 Chat Completions API，prompt 要求 LLM 將原始查詢改寫為 2 組替代查詢。回應解析順序：
1. 嘗試 `JSON.parse()` 直接解析
2. 嘗試提取 markdown code block 中的 JSON
3. 失敗則回傳空陣列

### Re-ranking 兩種策略

| 策略 | 設定值 | API 端點 | 說明 |
|------|-------|---------|------|
| `chat` | `rerankerStrategy: 'chat'` | `/v1/chat/completions` | 使用 LLM prompt 打分，適合通用模型 |
| `endpoint` | `rerankerStrategy: 'endpoint'` | `/v1/rerank` | 專用 cross-encoder API，適合 reranker 模型 |

`chat` 策略的 prompt 要求 LLM 對每個候選結果給出 0-10 的相關性分數，Adapter 正規化為 0.0-1.0。

### LLM Cache

使用 `llm_cache` SQLite 表快取 LLM 呼叫結果：
- Cache key：`{operation}:{query}:{hash(candidates)}` 的組合
- TTL：`cacheTTLMs`（預設 3600000 = 1 小時）
- 查詢時自動清理過期 entry

## NullLLMAdapter — 空實作

Null Object Pattern 實作，`provider: 'none'` 時使用。所有方法回傳空結果或 `false`，無任何副作用。使 Use Case 層不需判斷 LLM 是否存在。

## FileSystemVaultAdapter — 檔案系統

實作 `VaultPort`，封裝 Node.js `fs/promises` 操作。

- `listMarkdownFiles()`: 遞迴走訪目錄，跳過以 `.` 開頭的隱藏目錄
- `readDirtyFiles()`: 讀取 dirty file list（每行一個檔案路徑），過濾空行
- `appendDirtyFile()`: append 模式追加路徑到 dirty file list
- `globDirectories()`: 使用 `fs.readdir()` + pattern matching 實現簡易 glob

## VaultSessionAdapter — Session 持久化

實作 `SessionPort`，同時操作 SQLite（session 資料）和 vault（Markdown 匯出）。

### Markdown 匯出格式

```markdown
---
sessionId: "abc-123"
projectDir: "/path/to/project"
startedAt: 1708416000000
lastSavedAt: 1708419600000
turnCount: 42
---

# Session 摘要

## 概覽
...（overview）

## 決策
- ...（decisions）

## 成果
- ...（outcomes）

## 待辦事項
- ...（openItems）

## 標籤
auth, refactoring, ...（tags）
```

## TranscriptParser — JSONL 解析

解析 Claude Code 的 JSONL transcript 格式：

- 每行一個 JSON 物件，包含 `type`（`human`/`assistant`）和 `message`
- 提取 `tool_use` block 中的工具名稱
- 提取 Write/Edit/NotebookEdit 工具呼叫中的檔案路徑
- 回傳 `TranscriptSummary`：turns、turnCount、startedAt、endedAt、toolsUsed、filesModified

## 相關文件

- [領域介面（Ports）](../code-notes/domain-ports.md) — 每個 Adapter 實作的 Port 定義
- [資料庫 Schema 完整說明](../structure/database-schema.md) — DatabaseManager 建立的表結構
- [LLM 與 Embedding 提供者設定](../integrations/llm-providers.md) — API key 與 baseUrl 設定
- [錯誤處理與降級策略](../code-notes/error-handling.md) — Adapter 層的錯誤處理模式
