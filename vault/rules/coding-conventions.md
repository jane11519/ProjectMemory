---
title: "編碼慣例與設計規範"
tags: [coding-conventions, naming, clean-architecture, SOLID, dependency-inversion, port, adapter, TypeScript, Vitest, BDD]
source_kind: rule
date: 2026-02-20
---

# 編碼慣例與設計規範

## 架構層次與依賴規則

ProjectHub 嚴格遵循 Clean Architecture 的依賴方向：

```
Domain ← Application ← Infrastructure ← Interface (MCP / CLI)
```

**硬性規則：**
- Domain 層不 import Application、Infrastructure 或 Interface 層的任何模組
- Application 層只 import Domain 層的 Entity、Value Object、Port 介面
- Infrastructure 層實作 Domain Port 介面，可 import Domain 和 Application 的型別
- Interface 層（MCP tools、CLI commands）負責組裝依賴圖並呼叫 Use Case

## 檔案組織慣例

| 類型 | 位置 | 命名慣例 | 範例 |
|------|------|---------|------|
| Entity | `src/domain/entities/` | PascalCase.ts | `Document.ts`, `Chunk.ts` |
| Value Object | `src/domain/value-objects/` | PascalCase.ts | `ContentHash.ts`, `RRFScore.ts` |
| Port | `src/domain/ports/` | PascalCase + Port.ts | `EmbeddingPort.ts`, `LLMPort.ts` |
| Use Case | `src/application/` | PascalCase + UseCase.ts | `SearchUseCase.ts` |
| DTO | `src/application/dto/` | PascalCase.ts | `SearchRequest.ts` |
| Adapter | `src/infrastructure/{module}/` | PascalCase + Adapter.ts | `FTS5Adapter.ts` |
| MCP Tool | `src/mcp/tools/` | PascalCase + Tool.ts | `SearchTool.ts` |
| CLI Command | `src/cli/commands/` | lowercase.ts | `search.ts`, `init.ts` |

## TypeScript 慣例

### 型別定義偏好
- **Entity**: 使用 `interface`（資料載體，行為由 Use Case 編排）
- **Value Object**: 使用 `class`（封裝不可變的領域邏輯）
- **Port**: 使用 `interface`（抽象介面，由 Adapter 實作）
- **DTO**: 使用 `interface`（純資料傳輸，無行為）

### Import 規則
- 使用 `import type` 匯入僅用於型別的模組（啟用 TypeScript 的 `isolatedModules`）
- 檔案副檔名使用 `.js`（ESM 模組解析，即使原始碼是 `.ts`）

### 命名規則
- 變數與函式：camelCase
- 類別與介面：PascalCase
- 常數：UPPER_SNAKE_CASE（僅用於真正不變的值）
- 私有成員：使用 `private readonly` 修飾符（不使用 `_` 前綴）

## 設計模式使用

### 必須使用的模式

| 模式 | 使用場景 | 範例 |
|------|---------|------|
| Port-Adapter | 所有外部 I/O | `EmbeddingPort` → `OpenAIEmbeddingAdapter` |
| Null Object | 可選依賴 | `NullLLMAdapter`（provider='none' 時） |
| Factory | 複雜物件組裝 | `createMcpServer()` |
| Value Object | 領域邏輯封裝 | `ContentHash`, `RRFScore` |

### 依賴注入
- 不使用 DI container，在組合根（Composition Root）手動建構
- Use Case 建構子接受 Port 介面，測試時注入 mock
- 組合根位於 CLI command handler 和 MCP server 建立函式中

## 錯誤處理規範

- **搜尋管線**：各階段獨立 try-catch，失敗時降級而非中斷
- **索引管線**：DB 操作在 transaction 內，embedding 在 transaction 外（允許部分成功）
- **外部 API**：catch 後記錄 warning，不拋出（優雅降級優先）
- **使用者輸入**：FTS5 查詢做 sanitize（引號包裹 token），防止語法錯誤

## 測試規範

### 測試框架與風格
- **框架**：Vitest
- **風格**：BDD（Given/When/Then）
- **目錄**：`tests/unit/` + `tests/integration/`

### 測試命名
```typescript
describe('SearchUseCase', () => {
  describe('deep search', () => {
    it('should skip expansion when strong signal is detected', () => {
      // Given: BM25 結果有明顯的 top-1 優勢
      // When: 執行 deep search
      // Then: pipelineStages 中 query_expansion.skipped === true
    });
  });
});
```

### 測試層級
- **單元測試**：Domain 值物件、Use Case 邏輯（mock Port）
- **整合測試**：SQLite Adapter + 真實 DB、索引管線端到端
- **核心邏輯覆蓋率**：domain/ 和 application/ 目標 ≥ 80%

## 註解規範

- 所有程式碼註解使用**繁體中文**
- 註解說明**設計意圖**（為什麼），而非實作細節（是什麼）
- Port 介面的 JSDoc 說明介面契約與使用場景
- Value Object 的類別 JSDoc 說明演算法原理與參考來源

## 相關文件

- [專案目錄結構地圖](../structure/project-structure.md) — 檔案位置與命名對照
- [架構總覽](../code-notes/architecture-overview.md) — 分層架構設計
- [文件撰寫規範](../rules/document-authoring.md) — vault 文件的撰寫格式
