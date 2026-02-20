---
title: "CLI 指令完整參考"
tags: [CLI, commander, init, scan, index, search, context, session, health, mcp, projecthub]
source_kind: code_note
date: 2026-02-20
---

# CLI 指令完整參考

## CLI 概覽

ProjectHub CLI 基於 Commander.js，主程式入口為 `projecthub`（透過 `npx projecthub` 或全域安裝後直接呼叫）。指令群組涵蓋專案初始化、索引管理、搜尋、context、session 和 MCP Server 啟動。

## init — 專案初始化

在目標專案中初始化 ProjectHub 環境。

```bash
npx projecthub init [--target <dir>]
```

**執行步驟：**
1. 複製 skill 檔案到 `.claude/skills/projecthub/`
2. 合併 hooks 到 `.claude/settings.json`（PostToolUse、TaskCompleted、Stop 事件）
3. 從 `DEFAULT_CONFIG` 產生 `.projecthub.json`
4. 建立 vault 目錄結構（code-notes、rules、integrations、sessions、structure）+ `.gitignore`
5. 建立/合併 `.mcp.json`（projecthub MCP server entry）
6. 初始化 SQLite 資料庫（建表 + 建立 root namespace）
7. 輸出初始化報告

**冪等性**：重複執行不會覆蓋已存在的設定，採用 merge 策略。

## scan — 掃描命名空間

偵測專案中的命名空間和 vault 文件。

```bash
npx projecthub scan [--repo-root <dir>] [--format json|text]
```

**偵測項目：**
- Git submodules（解析 `.gitmodules`）
- Directory namespaces（依 `namespacePatterns` 比對目錄）
- Vault 文件清單（各資料夾的 Markdown 檔案數量與 metadata）

## index — 索引管理

### index build — 全量建索引

```bash
npx projecthub index build [--repo-root <dir>] [--format json|text]
```

掃描所有 vault 資料夾，對每個 Markdown 檔案執行完整索引流程（解析 → 切塊 → FTS5 → embedding → vec0）。

**前置條件**：確保 root namespace 存在。若不存在，自動建立 `name: 'root', kind: 'root'`。

### index update — 增量更新

```bash
npx projecthub index update [--repo-root <dir>] [--format json|text]
```

僅處理 `dirty-files.txt` 中列出的變更檔案。比對 `content_hash` 決定是否需要重新索引。

## search — 搜尋

### search \<query\> — 主搜尋

```bash
npx projecthub search <query> [options]
```

**選項：**

| 選項 | 說明 | 預設值 |
|------|------|-------|
| `--mode <mode>` | hybrid / bm25_only / vec_only / deep | hybrid |
| `--top-k <n>` | 回傳結果數 | 10 |
| `--namespace <id>` | 限定命名空間 ID | 無 |
| `--skip-expansion` | 跳過 Query Expansion（deep 模式） | false |
| `--skip-reranking` | 跳過 LLM Re-ranking（deep 模式） | false |
| `--format json\|text` | 輸出格式 | text |

### search expand \<chunkId\> — 展開 Chunk

```bash
npx projecthub search expand <chunkId>
```

顯示指定 chunk 的完整文字，包含 heading path、行號範圍。

### search full \<docPath\> — 展開文件

```bash
npx projecthub search full <docPath>
```

顯示指定文件的所有 chunks，按 chunk_index 排序。

## context — Context 管理

### context add — 新增/更新

```bash
npx projecthub context add <virtualPath> <description>
```

新增或更新虛擬路徑的 context 描述。使用 upsert 語意。

### context list — 列出所有

```bash
npx projecthub context list [--format json|text]
```

### context check — 查詢（含繼承）

```bash
npx projecthub context check <virtualPath>
```

顯示指定路徑及其所有祖先路徑的 context 描述。

### context rm — 刪除

```bash
npx projecthub context rm <virtualPath>
```

## session — Session 管理

### session capture — 擷取 Transcript

```bash
npx projecthub session capture [--repo-root <dir>] [--format json|text]
```

從 Claude Code 的 JSONL session 檔案中提取對話記錄並儲存。自動定位 Claude Code session 路徑（根據專案目錄編碼）。

### session save — 儲存快照

```bash
npx projecthub session save [--session-id <id>] [--repo-root <dir>]
```

將 session 快照儲存至 SQLite 並匯出 vault Markdown。

### session list — 列出 Sessions

```bash
npx projecthub session list [--format json|text]
```

顯示所有 active 狀態的 sessions。

### session compact — 壓縮摘要

```bash
npx projecthub session compact [--session-id <id>]
```

壓縮 rolling summary，減少 token 佔用。

## health — 索引健康檢查

```bash
npx projecthub health [--repo-root <dir>] [--fix] [--format json|text]
```

**檢查項目：**
- 孤立 chunks（doc_id 指向不存在的 doc）
- FTS5 一致性（chunk 數量 vs FTS5 行數）
- Embedding 服務健康

**`--fix` 選項：**
- 刪除孤立 chunks
- 重建 FTS5 索引（若不一致）

回傳結構化健康報告，非零 exit code 表示有問題。

## mcp — 啟動 MCP Server

```bash
npx projecthub mcp [--repo-root <dir>] [--http] [--port <n>]
```

**傳輸模式：**
- `stdio`（預設）：標準輸入/輸出，適合 Claude Code 直接整合
- `--http`：HTTP SSE 傳輸，適合遠端或多 client 場景

**啟動流程：**
1. 載入設定（`.projecthub.json` + defaults merge）
2. 初始化 DatabaseManager → DB + FTS5 + Vec
3. 建立 Embedding Adapter
4. 建立 LLM Adapter（HttpLLMAdapter 或 NullLLMAdapter）
5. 建立 Session 相關 adapter（若有 sessionPort）
6. 呼叫 `createMcpServer()` 註冊所有工具
7. 連接傳輸層，開始接受請求
8. 註冊 SIGINT/SIGTERM 優雅關閉

## 相關文件

- [MCP 工具完整參考](../code-notes/mcp-tools.md) — MCP 工具參數對照
- [索引管線與增量更新](../code-notes/indexing-pipeline.md) — index build/update 的內部流程
- [Session 系統與 Summarization](../code-notes/session-system.md) — session 指令的完整生命週期
- [Claude Code 整合指南](../integrations/claude-code-integration.md) — init 指令建立的整合設定
