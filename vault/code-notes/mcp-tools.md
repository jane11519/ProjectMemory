---
title: "MCP 工具完整參考"
tags: [MCP, tool, projmem_search, projmem_vector_search, projmem_deep_search, projmem_get, projmem_multi_get, projmem_status, projmem_session_list, projmem_session_transcript, projmem_session_update_summary, McpServer]
source_kind: code_note
date: 2026-02-20
---

# MCP 工具完整參考

## MCP Server 概覽

projmem MCP Server（版本 0.2.0）透過 `createMcpServer()` 工廠函式建立，支援 stdio 和 HTTP SSE 兩種傳輸方式。共註冊 9 個工具（6 核心 + 3 Session 工具）。

MCP instructions 包含推薦的搜尋工作流：
1. 先用 `projmem_search`（BM25 關鍵字搜尋）快速定位
2. 需要語意搜尋時使用 `projmem_vector_search`
3. 複雜查詢使用 `projmem_deep_search`（完整管線）
4. 取得完整 chunk 內容用 `projmem_get` / `projmem_multi_get`

## projmem_search — BM25 關鍵字搜尋

使用 FTS5 BM25 演算法的精確關鍵字搜尋。適合搜尋已知的類別名稱、函式名、設定 key。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `query` | string | 是 | 搜尋查詢字串 |
| `topK` | number | 否 | 回傳結果數（預設 10） |
| `namespaceId` | number | 否 | 限定命名空間 |

**輸出格式：**
```
#42 | doc-path.md | "Heading Path" | score: 0.85
  snippet preview text...
```

附帶搜尋模式（`bm25_only`）、耗時、結果數量。有警告時顯示。

## projmem_vector_search — 語意向量搜尋

使用 sqlite-vec 的 KNN 向量搜尋。適合語意模糊的自然語言查詢。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `query` | string | 是 | 搜尋查詢字串（會先轉為 embedding） |
| `topK` | number | 否 | 回傳結果數（預設 10） |
| `namespaceId` | number | 否 | 限定命名空間 |

搜尋流程：query → `EmbeddingPort.embedOne()` → `SqliteVecAdapter.searchKNN()` → enrichment。

## projmem_deep_search — 完整管線搜尋

觸發 deep search 八階段管線，結合 BM25、Vector、LLM expansion 和 reranking。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `query` | string | 是 | 搜尋查詢字串 |
| `topK` | number | 否 | 回傳結果數（預設 10） |
| `namespaceId` | number | 否 | 限定命名空間 |
| `skipExpansion` | boolean | 否 | 跳過 Query Expansion（預設 false） |
| `skipReranking` | boolean | 否 | 跳過 LLM Re-ranking（預設 false） |

**額外輸出：**
- Expanded queries：LLM 產生的替代查詢
- Strong signal：是否偵測到強訊號（跳過 expansion）
- Re-ranking applied：是否套用了 LLM 重排
- Pipeline stages：各階段名稱與耗時
- 每個結果額外顯示 `rrfScore` 和 `rerankerScore`

## projmem_get — 單一 Chunk/Doc 取得

依 chunk ID 或 doc path 取得完整內容。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `identifier` | string | 是 | Chunk ID（如 `"#123"` 或 `"123"`）或文件路徑 |

**行為：**
- Chunk ID（`#` 前綴或純數字）：回傳單一 chunk 的 heading_path、start_line、end_line、text、namespace_name
- Doc path：回傳該文件的所有 chunks，包含完整文字

## projmem_multi_get — 批次取得

批量取得多個 chunks 或文件。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `chunkIds` | number[] | 否 | Chunk ID 陣列 |
| `docPaths` | string[] | 否 | 文件路徑陣列 |
| `pathPattern` | string | 否 | SQL LIKE 模式（如 `"code-notes/auth%"`） |

三個參數至少提供一個。`pathPattern` 匹配結果限制 20 筆。輸出包含每個 chunk 的完整 metadata 和文字。

## projmem_status — 索引狀態

回傳索引健康狀態與統計資訊。

**參數：** 無

**輸出包含：**
- Document count / Chunk count / Namespace count
- Embedding dimension
- LLM cache size
- Documents by source_kind（各類型文件數量）
- Namespace list（名稱與類型）

## projmem_session_list — Session 列表

列出 sessions，支援過濾。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `status` | string | 否 | 過濾狀態：`active` / `compacted` / `closed` |
| `hasSummary` | boolean | 否 | `true` = 有摘要, `false` = 無摘要 |
| `limit` | number | 否 | 回傳筆數上限（預設 10） |

**輸出：** 每個 session 顯示 ID、是否有 summary、狀態、turn count、最後儲存時間。

## projmem_session_transcript — 讀取 Transcript

取得 session 的完整對話記錄。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `sessionId` | string | 否 | Session ID（省略則使用最近的 session） |

**輸出格式：**
```
--- Turn 1 [user] 2026-02-20T10:30:00Z ---
使用者的訊息文字...

--- Turn 2 [assistant] 2026-02-20T10:30:05Z ---
Tools: Read, Write, Bash
助手的回應文字...
```

附帶 session 持續時間和修改過的檔案清單。

## projmem_session_update_summary — 寫入摘要

儲存由 Claude 生成的結構化 session 摘要。

**參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `sessionId` | string | 是 | 目標 Session ID |
| `overview` | string | 是 | 2-3 句話總結 |
| `decisions` | string[] | 是 | 架構/設計決策列表 |
| `outcomes` | string[] | 是 | 成果列表 |
| `openItems` | string[] | 是 | 待辦/未解決問題列表 |
| `tags` | string[] | 是 | 主題標籤 |

寫入 `sessions.summary_json`，同時匯出 vault Markdown 檔案。工具會驗證 session 存在性。

## 相關文件

- [多階段搜尋管線](../code-notes/search-pipeline.md) — deep_search 背後的八階段管線
- [Session 系統與 Summarization](../code-notes/session-system.md) — Session 工具的完整工作流
- [CLI 指令完整參考](../code-notes/cli-commands.md) — 對應的 CLI 操作
- [Claude Code 整合指南](../integrations/claude-code-integration.md) — MCP Server 設定方式
