---
title: "文件撰寫規範"
tags: [document-authoring, markdown, frontmatter, chunking, FTS5, tags, heading, vault, source_kind]
source_kind: rule
date: 2026-02-20
---

# 文件撰寫規範

## Frontmatter 規範

每份 vault 文件必須以 YAML frontmatter 開頭：

```yaml
---
title: "文件標題"
tags: [tag1, tag2, tag3]
source_kind: code_note
date: 2026-02-20
---
```

| 欄位            | 必填  | 說明                                                              |
| ------------- | --- | --------------------------------------------------------------- |
| `title`       | 是   | 文件標題，對應 FTS5 `title` 欄位（權重 8.0）                                 |
| `tags`        | 是   | 標籤陣列，對應 FTS5 `tags` 欄位（權重 2.0）                                  |
| `source_kind` | 是   | 分類：`code_note`, `rule`, `integration_doc`, `dir_map`, `session` |
| `date`        | 建議  | 建立/更新日期                                                         |

### Tags 撰寫指引

Tags 是 FTS5 搜尋的高權重欄位（2.0），應包含：
- **程式碼識別符**：class 名、函式名、Port 名（例如 `SearchUseCase`, `EmbeddingPort`）
- **設定 key**：設定檔中的 key（例如 `fusionMethod`, `strongSignalMinScore`）
- **技術概念**：演算法或模式名稱（例如 `RRF`, `BM25`, `graceful-degradation`）
- **避免過度標註**：每個 tag 應有明確的搜尋價值，避免通用詞（例如 `code`, `project`）

## Heading 結構

### 層級規範
- **H1**（`#`）：文件標題，每份文件僅一個，與 frontmatter title 一致
- **H2**（`##`）：主要章節，對應 `ChunkingStrategy` 的主要切割邊界
- **H3**（`###`）：子章節，更細粒度的主題

### Chunk 友善設計

`ChunkingStrategy.chunkByHeadings()` 依 heading 切割文件，每個 H2/H3 段落成為獨立的搜尋 chunk。撰寫時應確保：

1. **每段自成一體**：單一 chunk 應包含足夠的 context，搜尋結果不需依賴兄弟段落
2. **控制段落長度**：每個 H2/H3 段落建議 300-500 tokens，過長的段落會降低搜尋精準度
3. **Heading 命名混合中英文**：例如 `### Stage 5: RRF 融合`，兼顧語意理解與英文關鍵字搜尋

### Heading Path 的搜尋影響

heading 層級路徑（`headingPath`）對應 FTS5 `heading_path` 欄位（權重 4.0）。例如：
- H2 `## 搜尋管線降級策略` → headingPath 包含 "搜尋管線降級策略"
- H3 `### Classic Search 降級` → headingPath 包含 "搜尋管線降級策略 Classic Search 降級"

因此 heading 中的關鍵字直接影響搜尋排名，應選擇具描述性且包含搜尋關鍵字的標題。

## 內容撰寫原則

### 語言規範
- 正文使用**繁體中文**
- 技術術語保留英文（class 名、API 名、演算法名）
- 程式碼區塊保持原始語言（TypeScript、SQL、JSON、Bash）

### 程式碼區塊
- 使用 fenced code block（三個反引號），標註語言類型
- 程式碼範例應可獨立理解，包含必要的型別標註
- 避免在 code block 中使用 heading-like 行（`#` 開頭），會被 `ChunkingStrategy` 忽略但可能造成混淆

### 表格
- 適合呈現參數列表、設定對照、模式比較
- 每欄保持簡潔，複雜說明放在表格前後的段落中

### 交叉引用
- 每份文件末尾包含 `## 相關文件` 章節
- 使用相對路徑：`[文件名](../category/filename.md)`
- 簡要說明引用原因（一句話）

## Source Kind 分類

| source_kind       | 對應目錄                  | 內容類型             |
| ----------------- | --------------------- | ---------------- |
| `code_note`       | `vault/code-notes/`   | 架構筆記、設計決策、管線演算法  |
| `rule`            | `vault/rules/`        | 編碼慣例、撰寫規範        |
| `integration_doc` | `vault/integrations/` | 外部服務整合指南         |
| `dir_map`         | `vault/structure/`    | 目錄結構、Schema 參考   |
| `session`         | `vault/sessions/`     | Session 摘要（自動匯出） |

## 相關文件

- [索引管線與增量更新](../code-notes/indexing-pipeline.md) — Frontmatter 如何映射到 FTS5 欄位
- [編碼慣例與設計規範](../rules/coding-conventions.md) — 程式碼層面的規範
- [資料庫 Schema 完整說明](../structure/database-schema.md) — chunks_fts 表欄位定義
