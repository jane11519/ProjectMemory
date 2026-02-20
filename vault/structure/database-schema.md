---
title: "資料庫 Schema 完整說明"
tags: [database, schema, sqlite, fts5, sqlite-vec, vec0, chunks, docs, namespaces, sessions, WAL]
source_kind: dir_map
date: 2026-02-20
---

# 資料庫 Schema 完整說明

## PRAGMA 設定

ProjectHub 使用 SQLite 搭配 WAL（Write-Ahead Logging）模式，確保讀寫並行效能。資料庫初始化時套用以下 PRAGMA：

| PRAGMA | 值 | 說明 |
|--------|----|------|
| `journal_mode` | WAL | 支援讀寫並行，提升 MCP Server 並行查詢效能 |
| `busy_timeout` | 5000 | 等待鎖定逾時 5 秒，避免 SQLITE_BUSY 錯誤 |
| `synchronous` | NORMAL | 在 WAL 模式下足夠安全，效能優於 FULL |
| `foreign_keys` | ON | 啟用外鍵約束，確保資料完整性 |
| `cache_size` | -64000 | 64MB 頁面快取（負數 = KB 單位） |

## schema_meta 表 — 後設資料

儲存系統級 key-value 後設資料，目前用於追蹤 embedding 維度。

```sql
CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

關鍵用途：`DatabaseManager` 在初始化時將 `embedding_dimension` 寫入此表。若後續偵測到 dimension 變更（例如從 1536 切換到 768），會拋出錯誤要求重建索引，防止混用不同維度的向量。

## namespaces 表 — 命名空間

支援 monorepo 結構，每個子模組或目錄可定義為獨立命名空間。

```sql
CREATE TABLE namespaces (
  namespace_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('submodule','directory','root')),
  git_url TEXT,
  git_commit TEXT,
  discovered_at INTEGER NOT NULL,
  last_scanned_at INTEGER
);
```

- `kind`: `root`（預設專案根目錄）、`submodule`（git submodule）、`directory`（monorepo 子目錄）
- `git_url` / `git_commit`: 僅 submodule 需要，用於追蹤遠端版本
- `ScanUseCase` 透過 `namespacePatterns`（預設 `['services/*', 'packages/*', ...]`）自動偵測目錄型命名空間

## docs 表 — 文件

每個 vault 中的 Markdown 檔案對應一筆 doc 記錄。`content_hash` 用於增量索引的變更偵測。

```sql
CREATE TABLE docs (
  doc_id INTEGER PRIMARY KEY,
  namespace_id INTEGER NOT NULL DEFAULT 1,
  doc_path TEXT NOT NULL UNIQUE,
  ref_code_path TEXT,
  source_kind TEXT NOT NULL DEFAULT 'code_note'
    CHECK(source_kind IN ('code_note','rule','integration_doc','dir_map','session','other')),
  title TEXT,
  content_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  frontmatter_json TEXT,
  indexed_at INTEGER NOT NULL,
  FOREIGN KEY(namespace_id) REFERENCES namespaces(namespace_id)
);
```

- `doc_path`: vault 根目錄的相對路徑（例如 `code-notes/search-pipeline.md`）
- `source_kind`: 分類標籤，對應 vault 子目錄命名慣例
- `content_hash`: SHA-256 雜湊，`IndexUseCase.buildIncremental()` 比對此值決定是否需要重新索引
- `frontmatter_json`: YAML frontmatter 的 JSON 序列化，供 FTS5 的 `properties` 欄位使用

## chunks 表 — 文件片段

一個 doc 切割成多個 chunk，每個 chunk 是一個可獨立搜尋的知識片段。`ChunkingStrategy` 依 Markdown heading 層級（H1-H6）進行分割。

```sql
CREATE TABLE chunks (
  chunk_id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  token_estimate INTEGER,
  FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
);
```

- `heading_path`: 空格分隔的 heading 層級路徑（例如 `"搜尋管線 Stage 5: RRF 融合"`）
- `text_hash`: chunk 內容的 SHA-256，可用於未來的 chunk 層級增量更新
- `token_estimate`: 近似 token 數（`text.length / 4`），用於控制 LLM context window

## chunks_fts 虛擬表 — FTS5 全文搜尋

Contentless FTS5 表，支援加權全文搜尋。權重由 `FTS5Adapter` 在查詢時動態套用。

```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  title,         -- 權重 8.0（最高優先）
  heading_path,  -- 權重 4.0
  body,          -- 權重 1.0（chunk 全文）
  tags,          -- 權重 2.0（frontmatter tags，逗號分隔）
  properties,    -- 權重 3.0（frontmatter 其他欄位，key:value 格式）
  content='',
  contentless_delete=1,
  tokenize='unicode61 remove_diacritics 2'
);
```

- `contentless_delete=1`: 允許從 contentless 表中刪除行，支援增量更新
- `tokenize='unicode61 remove_diacritics 2'`: Unicode 分詞器，移除變音符號，適合多語言內容
- 查詢時使用 `bm25()` 函式，配合 `FTS5Adapter` 中的欄位權重產生排名分數

## chunks_vec 虛擬表 — sqlite-vec 向量搜尋

使用 sqlite-vec 擴充套件建立的 vec0 虛擬表，儲存 chunk 的 embedding 向量。

```sql
CREATE VIRTUAL TABLE chunks_vec USING vec0(
  embedding float[{dimension}]  -- 預設 1536（text-embedding-3-small）
);
```

- 維度由 `embedding.dimension` 設定決定，寫入 `schema_meta` 追蹤
- `SqliteVecAdapter.searchKNN()` 使用 KNN 查詢：`WHERE embedding MATCH ? AND k = ?`
- 相似度計算：`1 / (1 + distance)`，距離越小相似度越高，結果正規化至 [0, 1]
- 此表由 `DatabaseManager` 在 sqlite-vec 擴充載入後動態建立

## sessions 表 — 對話 Session

追蹤 Claude Code 對話的 session 狀態與摘要。

```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  project_dir TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_saved_at INTEGER NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  rolling_summary TEXT,
  decisions_json TEXT,
  search_footprint_json TEXT,
  summary_json TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','compacted','closed'))
);
```

- `status`: `active`（進行中）→ `compacted`（已壓縮摘要）→ `closed`（已完結）
- `rolling_summary`: 逐步更新的對話摘要文字
- `summary_json`: 由 Claude 透過 MCP tool 寫入的結構化 `SessionSummary` JSON
- `decisions_json` / `search_footprint_json`: 追蹤本次 session 中做出的架構決策與搜尋歷程

## 輔助表

### llm_cache — LLM 快取

```sql
CREATE TABLE llm_cache (
  cache_key TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

快取 LLM 呼叫結果（Query Expansion、Re-ranking），TTL 預設 1 小時（`cacheTTLMs: 3600000`）。`HttpLLMAdapter` 使用查詢字串 + 操作類型作為 cache key。

### audit_log — 審計日誌

```sql
CREATE TABLE audit_log (
  log_id INTEGER PRIMARY KEY,
  timestamp_ms INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_path TEXT,
  namespace_id INTEGER,
  detail_json TEXT,
  content_hash_before TEXT,
  content_hash_after TEXT
);
```

記錄索引操作的變更歷史。`IndexPort.writeAuditLog()` 提供統一的審計寫入介面。

### path_contexts — 階層式 Context

```sql
CREATE TABLE path_contexts (
  context_id INTEGER PRIMARY KEY,
  virtual_path TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

儲存虛擬路徑到 context 描述的映射。`ContextUseCase.checkContext()` 實現階層繼承：查詢 `code-notes/services/auth` 時會同時匹配 `code-notes` 和 `code-notes/services` 的 context。

## 索引定義 Indexes

```sql
CREATE INDEX idx_docs_namespace ON docs(namespace_id);
CREATE INDEX idx_docs_content_hash ON docs(content_hash);
CREATE INDEX idx_docs_source_kind ON docs(source_kind);
CREATE INDEX idx_chunks_doc_id ON chunks(doc_id);
CREATE INDEX idx_chunks_text_hash ON chunks(text_hash);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp_ms);
CREATE INDEX idx_audit_target ON audit_log(target_path);
```

- `idx_docs_content_hash`: 加速增量索引的 hash 比對
- `idx_chunks_doc_id`: 加速 doc → chunks 的 JOIN 查詢（搜尋結果豐富化）
- `idx_audit_timestamp`: 支援審計日誌的時間範圍查詢

## 相關文件

- [專案目錄結構地圖](../structure/project-structure.md) — 對應的原始碼檔案位置
- [索引管線與增量更新](../code-notes/indexing-pipeline.md) — 資料如何寫入這些表
- [多階段搜尋管線](../code-notes/search-pipeline.md) — 查詢如何從這些表讀取資料
- [基礎設施層轉接器](../code-notes/infrastructure-adapters.md) — DatabaseManager 初始化流程
