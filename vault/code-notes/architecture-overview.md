---
title: "ProjectHub 架構總覽"
tags: [architecture, clean-architecture, hexagonal, dependency-inversion, MCP, CLI, domain, application, infrastructure]
source_kind: code_note
date: 2026-02-20
---

# ProjectHub 架構總覽

## 系統定位 System Purpose

ProjectHub 是一個專案知識管理系統，以 CLI + MCP Server 雙介面提供服務。它將 Markdown 文件索引至 SQLite 資料庫（FTS5 全文搜尋 + sqlite-vec 向量搜尋），並透過多階段搜尋管線提供精準的知識檢索。

核心價值主張：讓 AI 助手（如 Claude Code）能夠透過 MCP 工具搜尋專案的架構筆記、設計決策、編碼慣例，實現「AI 可查詢的專案知識庫」。

## 架構分層 Layered Architecture

ProjectHub 採用 Clean Architecture（亦稱 Hexagonal Architecture / Ports & Adapters），依賴方向嚴格由外向內：

```
┌──────────────────────────────────────────────┐
│  Interface Layer (MCP Tools / CLI Commands)   │ ← 最外層
├──────────────────────────────────────────────┤
│  Infrastructure Layer (SQLite, OpenAI, FS)    │ ← Adapter 實作
├──────────────────────────────────────────────┤
│  Application Layer (Use Cases / DTOs)         │ ← 業務流程編排
├──────────────────────────────────────────────┤
│  Domain Layer (Entities / Value Objects / Ports) │ ← 最內層，零外部依賴
└──────────────────────────────────────────────┘
```

**依賴規則**：內層不知道外層的存在。Domain 定義 Port 介面，Infrastructure 實作 Adapter，Application 透過建構子注入串接。

## 雙介面設計 Dual Interface

ProjectHub 提供兩個平行的外部介面，共用相同的 Application 層與 Infrastructure 層：

### MCP Server（AI 工具呼叫）
- 9 個 MCP tools：搜尋（3）、取得（2）、狀態（1）、Session（3）
- 支援 stdio 和 HTTP SSE 兩種傳輸方式
- 由 `McpServer.ts` 工廠函式統一建立與註冊

### CLI（開發者操作）
- 基於 Commander.js 的指令介面
- 指令群組：`init`, `scan`, `index`, `search`, `context`, `session`, `health`, `mcp`
- 每個指令建立自己的依賴實例（不與 MCP Server 共享狀態）

## 核心資料流 Core Data Flow

### 索引流程（Write Path）
```
Markdown 文件 → MarkdownParser（解析 frontmatter）
  → ChunkingStrategy（heading-based 切塊）
  → SQLite transaction（doc + chunks + FTS5）
  → OpenAI API（embedding 向量）
  → vec0 表（向量儲存）
```

### 搜尋流程（Read Path）
```
使用者查詢 → SearchUseCase
  → FTS5Adapter（BM25 全文搜尋）
  → SqliteVecAdapter（KNN 向量搜尋）
  → HybridScore / RRFScore（分數融合）
  → [LLM expansion + reranking（deep 模式）]
  → 結果豐富化（JOIN doc + namespace）
  → SearchResponse
```

### Session 流程
```
Claude Code JSONL → TranscriptParser（解析對話）
  → SessionUseCase.save()（寫入 SQLite）
  → MCP: session_transcript → Claude 讀取
  → MCP: session_update_summary → 寫回結構化摘要
  → vault/sessions/{date}_{id}.md（Markdown 匯出）
```

## 依賴注入策略 Dependency Injection

ProjectHub 不使用 DI container，而是在組合根（Composition Root）手動建立依賴圖。組合根位於：
- **CLI**: 各 `src/cli/commands/*.ts` 的指令 handler 函式
- **MCP**: `src/cli/commands/mcp.ts` 中的 `mcp` 指令 handler

典型的依賴組裝：
```
DatabaseManager → { db, fts5, vec }
OpenAIEmbeddingAdapter → embeddingPort
HttpLLMAdapter / NullLLMAdapter → llmPort
FileSystemVaultAdapter → vaultPort
SearchUseCase(db, fts5, vec, embeddingPort, llmPort)
IndexUseCase(db, fts5, vec, mdParser, chunker, vaultPort, embeddingPort)
```

## 設定管理 Configuration

設定來源與優先級：
1. `.projecthub.json`（專案根目錄，最高優先）
2. `DEFAULT_CONFIG`（`src/config/defaults.ts`，兜底預設值）

設定透過 `PartialConfig` 型別進行深層合併。關鍵設定區塊：
- `vault`: vault 根目錄與資料夾清單
- `index`: DB 路徑、dirty file 路徑
- `embedding`: provider、model、dimension
- `search`: 權重、融合方法、RRF 參數
- `llm`: provider、baseUrl、model、reranker 策略
- `chunking`: chunk 最大 token 數、重疊行數
- `session`: 自動儲存間隔、壓縮 token 閾值

## 擴展性考量 Extensibility

- **新增搜尋模式**：在 `SearchUseCase.search()` 的 mode 分支新增
- **新增 LLM provider**：實作 `LLMPort` 介面（例如 Ollama、Claude API）
- **新增 embedding provider**：實作 `EmbeddingPort` 介面
- **新增 MCP tool**：在 `src/mcp/tools/` 新增註冊函式，在 `McpServer.ts` 中呼叫
- **新增 CLI command**：在 `src/cli/commands/` 新增指令模組

## 相關文件

- [專案目錄結構地圖](../structure/project-structure.md) — 完整檔案結構
- [領域模型與值物件](../code-notes/domain-model.md) — Domain 層詳細設計
- [領域介面（Ports）](../code-notes/domain-ports.md) — Port-Adapter 介面定義
- [錯誤處理與降級策略](../code-notes/error-handling.md) — 優雅降級機制
