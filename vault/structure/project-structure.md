---
title: "專案目錄結構地圖"
tags: [project-structure, directory-map, clean-architecture, hexagonal, vault, src]
source_kind: dir_map
date: 2026-02-20
---

# 專案目錄結構地圖

## 頂層結構 Top-Level Layout

projmem 採用 Clean Architecture（Hexagonal Architecture），原始碼依照依賴方向由內而外組織。頂層目錄佈局如下：

```
RepoMemory/
├── src/                    # 原始碼根目錄
│   ├── domain/             # 最內層：實體、值物件、Port 介面
│   ├── application/        # 用例層：業務邏輯流程編排
│   ├── infrastructure/     # 外層：具體技術實作（SQLite、OpenAI…）
│   ├── mcp/                # MCP Server 與工具註冊
│   ├── cli/                # Commander CLI 指令
│   └── config/             # 設定型別與預設值
├── vault/                  # 知識庫 vault 根目錄（被索引的文件）
│   ├── code-notes/         # 架構筆記、設計決策
│   ├── rules/              # 編碼慣例與規範
│   ├── integrations/       # 外部服務整合文件
│   ├── structure/          # 目錄結構與 Schema 參考
│   ├── sessions/           # Session 摘要匯出
│   └── .projmem/        # 索引資料庫與內部狀態
├── tests/                  # 測試檔案
│   ├── unit/               # 單元測試
│   └── integration/        # 整合測試
├── assets/                 # 靜態資源（技能檔等）
├── .projmem.json        # 專案設定檔
└── package.json            # Node.js 套件描述
```

## src/domain/ — 領域層

領域層是架構最內層，不依賴任何外部套件。所有對外 I/O 均透過 Port 介面抽象化。

```
src/domain/
├── entities/               # 領域實體
│   ├── Chunk.ts            # 文件片段（chunk）實體
│   ├── Document.ts         # 文件實體（含 SourceKind 類型）
│   ├── Namespace.ts        # 命名空間（root / submodule / directory）
│   ├── PathContext.ts       # 階層式 Context metadata 實體
│   ├── SearchResult.ts     # 搜尋結果實體（含多種分數）
│   └── Session.ts          # 對話 Session 實體
├── value-objects/          # 值物件
│   ├── ContentHash.ts      # SHA-256 內容雜湊（不可變）
│   ├── HybridScore.ts      # Linear 加權混合分數融合
│   ├── RRFScore.ts         # Reciprocal Rank Fusion 分數融合
│   ├── SessionSummary.ts   # 結構化 Session 摘要
│   └── StrongSignal.ts     # BM25 強訊號偵測
└── ports/                  # 抽象介面（Port）
    ├── EmbeddingPort.ts    # 嵌入向量產生介面
    ├── IndexPort.ts        # 索引讀寫操作介面
    ├── LLMPort.ts          # LLM 查詢擴展與重排介面
    ├── SessionPort.ts      # Session 持久化介面
    └── VaultPort.ts        # 檔案系統操作介面
```

## src/application/ — 應用層

應用層透過 Use Case 類別編排領域物件與基礎設施，實現業務流程。每個 Use Case 只依賴 Port 介面（建構時注入具體實作）。

```
src/application/
├── dto/                    # 資料傳輸物件
│   ├── SearchRequest.ts    # 搜尋請求（mode, topK, skipExpansion…）
│   ├── SearchResponse.ts   # 搜尋回應（含 PipelineStageInfo）
│   └── IndexStats.ts       # 索引統計結果
├── SearchUseCase.ts        # 多模式搜尋管線（hybrid/bm25/vec/deep）
├── IndexUseCase.ts         # 全量與增量索引管線
├── ScanUseCase.ts          # Vault 掃描與命名空間偵測
├── SessionUseCase.ts       # Session 生命週期管理
├── ContextUseCase.ts       # 階層式 Context CRUD
└── HealthCheckUseCase.ts   # 索引一致性檢查與修復
```

## src/infrastructure/ — 基礎設施層

基礎設施層包含所有外部技術的具體實作，每個模組實作對應的 Port 介面。

```
src/infrastructure/
├── sqlite/                 # SQLite 資料庫相關
│   ├── DatabaseManager.ts  # DB 初始化、schema 建立、sqlite-vec 載入
│   ├── FTS5Adapter.ts      # FTS5 全文搜尋轉接器
│   ├── SqliteVecAdapter.ts # sqlite-vec 向量搜尋轉接器
│   └── schema.ts           # 完整 DDL 定義
├── embedding/              # 嵌入向量產生
│   ├── OpenAIEmbeddingAdapter.ts  # OpenAI Embedding API 實作
│   └── EmbeddingBatcher.ts        # 批次嵌入請求
├── llm/                    # LLM 服務
│   ├── HttpLLMAdapter.ts   # OpenAI-compatible API 呼叫
│   └── NullLLMAdapter.ts   # 空實作（Null Object Pattern）
├── vault/                  # Vault 檔案操作
│   ├── FileSystemVaultAdapter.ts  # 檔案系統 VaultPort 實作
│   ├── MarkdownParser.ts          # Frontmatter + Body 解析
│   ├── ChunkingStrategy.ts        # Heading-based 切塊策略
│   └── GitModulesParser.ts        # .gitmodules 解析器
└── session/                # Session 持久化
    ├── VaultSessionAdapter.ts     # SQLite + Vault Markdown 寫入
    └── TranscriptParser.ts        # Claude Code JSONL 解析器
```

## src/mcp/ — MCP Server 層

MCP（Model Context Protocol）Server 提供 AI 工具呼叫介面。所有工具透過 McpServer 工廠函式註冊。

```
src/mcp/
├── McpServer.ts            # 工廠函式 + MCP instructions 產生
├── tools/                  # 個別工具註冊
│   ├── SearchTool.ts       # projmem_search（BM25 關鍵字搜尋）
│   ├── VectorSearchTool.ts # projmem_vector_search（語義搜尋）
│   ├── DeepSearchTool.ts   # projmem_deep_search（完整管線）
│   ├── GetTool.ts          # projmem_get（單一 chunk/doc 取得）
│   ├── MultiGetTool.ts     # projmem_multi_get（批次取得）
│   ├── StatusTool.ts       # projmem_status（索引狀態）
│   ├── SessionListTool.ts        # projmem_session_list
│   ├── SessionTranscriptTool.ts  # projmem_session_transcript
│   └── SessionUpdateSummaryTool.ts # projmem_session_update_summary
└── transports/             # MCP 傳輸層
    └── ...                 # stdio / HTTP SSE 傳輸實作
```

## vault/ — 知識庫結構

vault 是 projmem 管理的文件儲存區，遵循固定的資料夾慣例。所有 Markdown 文件經索引後可透過 MCP 工具搜尋。

```
vault/
├── .projmem/            # 內部狀態（不進版控）
│   ├── index.db            # SQLite 資料庫（FTS5 + vec0 + chunks）
│   ├── dirty-files.txt     # 增量索引用的變更檔案清單
│   └── audit.log           # 審計日誌
├── code-notes/             # source_kind: code_note
├── rules/                  # source_kind: rule
├── integrations/           # source_kind: integration_doc
├── structure/              # source_kind: dir_map
└── sessions/               # source_kind: session（自動匯出）
```

## 相關文件

- [資料庫 Schema 完整說明](../structure/database-schema.md) — 所有資料表定義與索引
- [架構總覽](../code-notes/architecture-overview.md) — Clean Architecture 層次與依賴方向
- [編碼慣例與設計規範](../rules/coding-conventions.md) — 檔案命名與組織規則
