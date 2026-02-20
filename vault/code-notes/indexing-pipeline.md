---
title: "索引管線與增量更新"
tags: [indexing, IndexUseCase, ChunkingStrategy, MarkdownParser, ContentHash, FTS5, sqlite-vec, embedding, incremental, dirty-files]
source_kind: code_note
date: 2026-02-20
---

# 索引管線與增量更新

## 索引管線概覽 Pipeline Overview

`IndexUseCase` 負責將 vault 中的 Markdown 文件解析、切塊、嵌入，寫入三個搜尋索引（chunks 表、FTS5 虛擬表、vec0 虛擬表）。支援全量建索引（`buildFull`）和增量更新（`buildIncremental`）兩種模式。

完整的單檔索引流程：
```
Markdown 文件
  → MarkdownParser.parse()         # 解析 YAML frontmatter + body
  → ChunkingStrategy.chunkByHeadings()  # heading-based 切塊
  → SQLite Transaction:
      → INSERT docs                 # 文件紀錄
      → INSERT chunks               # chunk 紀錄
      → INSERT chunks_fts           # FTS5 全文搜尋
  → EmbeddingPort.embed()          # 批次取得嵌入向量（非同步，transaction 外）
  → SqliteVecAdapter.insertRows()  # vec0 向量儲存
```

## 全量索引 buildFull

`buildFull(repoRoot, vaultRoot, folders)` 掃描指定的 vault 資料夾，對每個 Markdown 檔案執行完整索引。

流程步驟：
1. 遍歷 `folders`（預設 `['code-notes', 'rules', 'integrations', 'sessions', 'structure']`）
2. 對每個資料夾呼叫 `VaultPort.listMarkdownFiles()` 收集 `.md` 檔案
3. 逐檔呼叫 `indexFile()` 處理

全量索引不會先清空既有資料，而是使用 `INSERT OR REPLACE` 語意。若同一 `doc_path` 已存在，會替換文件紀錄（但 chunks 需要先手動清理）。

## 增量索引 buildIncremental

`buildIncremental(repoRoot, vaultRoot, dirtyFilePath)` 只處理 dirty file list 中的變更檔案，大幅減少索引時間。

增量偵測機制：
```
讀取 dirty-files.txt → 逐檔處理：
  if 檔案存在:
    計算 ContentHash.fromText(content)
    比對 docs.content_hash
    if hash 相同 → skip（docsSkipped++）
    if hash 不同 → 刪除舊 chunks → 重新 indexFile()
  if 檔案已刪除:
    刪除 docs + chunks + FTS5 + vec0 紀錄（docsDeleted++）
清空 dirty-files.txt
```

Dirty file list 的維護：Claude Code hooks（PostToolUse、TaskCompleted、Stop 事件）在偵測到 vault 文件變更時，呼叫 `VaultPort.appendDirtyFile()` 將路徑追加到 `dirty-files.txt`。

## Markdown 解析 MarkdownParser

使用 `gray-matter` 套件解析 YAML frontmatter。回傳 `ParsedMarkdown`：

```typescript
interface ParsedMarkdown {
  frontmatter: Record<string, any>;  // YAML frontmatter 鍵值對
  body: string;                      // frontmatter 之後的內容
}
```

`IndexUseCase` 從解析結果提取 title 的優先級：
1. `frontmatter.title`（YAML 中指定）
2. 正規表達式匹配第一個 H1：`/^#\s+(.+)$/m`
3. 檔名（去除 `.md` 副檔名）

## Heading-based Chunking 策略

`ChunkingStrategy.chunkByHeadings()` 依 Markdown heading（H1-H6）將文件切割為 chunk。

切割邏輯：
- 使用正規表達式 `/^(#{1,6})\s+(.*)\s*$/` 識別 heading 行
- 維護 heading stack 追蹤層級關係，遇到同級或更高層級的 heading 時出棧
- **code block 保護**：偵測到 ` ``` ` 行時切換 `inCodeBlock` 狀態，忽略 code block 內的 heading-like 行
- chunk 的 `headingPath` 由 stack 中所有 heading title 以空格連接

範例切割：
```markdown
# Architecture          ← chunk 0 開始
Some text...
## Domain Layer         ← chunk 1 開始（headingPath: "Architecture Domain Layer"）
### Entities            ← chunk 2 開始（headingPath: "Architecture Domain Layer Entities"）
Entity details...
## Application Layer    ← chunk 3 開始（headingPath: "Architecture Application Layer"）
```

## FTS5 欄位映射

每個 chunk 產生一筆 FTS5 紀錄，欄位映射如下：

| FTS5 欄位 | 來源 | 權重 | 說明 |
|-----------|------|------|------|
| `title` | `doc.title` | 8.0 | 文件標題（所有 chunk 共用） |
| `heading_path` | `chunk.headingPath` | 4.0 | Heading 層級路徑 |
| `body` | `chunk.text` | 1.0 | Chunk 全文 |
| `tags` | `frontmatter.tags.join(',')` | 2.0 | Frontmatter tags（逗號分隔） |
| `properties` | 其他 frontmatter 欄位 | 3.0 | `key:value` 格式 |

## Embedding 處理

Embedding 在 SQLite transaction 之外執行，因為它是非同步的 API 呼叫：

1. 收集所有 chunk 的 text 陣列
2. 呼叫 `EmbeddingPort.embed(chunkTexts)` 取得向量
3. 將 `{chunkId, embedding}` 寫入 vec0 表
4. 若 embedding 失敗，設定 `stats.embeddingFailed = true`，FTS5 索引不受影響

`EmbeddingBatcher` 將大量文字分批處理（預設每批 100 筆），避免 API 請求過大。

## 索引統計 IndexStats

`IndexUseCase` 回傳的統計資料結構：

```typescript
interface IndexStats {
  docsProcessed: number;    // 成功索引的文件數
  chunksCreated: number;    // 建立的 chunk 數
  ftsRowsInserted: number;  // FTS5 插入行數
  vecRowsInserted: number;  // vec0 插入行數
  docsSkipped: number;      // 增量模式跳過（hash 未變）
  docsDeleted: number;      // 增量模式刪除（檔案已移除）
  embeddingFailed: boolean; // embedding 是否失敗
  warnings: string[];       // 警告訊息
  durationMs: number;       // 總耗時（毫秒）
}
```

## 相關文件

- [資料庫 Schema 完整說明](../structure/database-schema.md) — chunks、docs、FTS5 表結構
- [多階段搜尋管線](../code-notes/search-pipeline.md) — 索引後資料如何被搜尋
- [錯誤處理與降級策略](../code-notes/error-handling.md) — Embedding 失敗的降級行為
- [基礎設施層轉接器](../code-notes/infrastructure-adapters.md) — MarkdownParser、ChunkingStrategy 實作
