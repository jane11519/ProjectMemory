---
title: "階層式 Context 系統"
tags: [context, PathContext, ContextUseCase, virtual-path, hierarchical-inheritance, path_contexts]
source_kind: code_note
date: 2026-02-20
---

# 階層式 Context 系統

## 設計目的 Purpose

Context 系統為 vault 中的文件路徑提供層級式的語意描述。當搜尋結果回傳時，可附帶相關的 context metadata，幫助 AI 助手理解文件所屬的領域與用途。

核心概念：虛擬路徑（virtual path）到 context 描述的映射，支援階層繼承。

## 虛擬路徑與階層繼承

`PathContext` 使用虛擬路徑（非檔案系統路徑）作為 key：

```
code-notes                → "ProjectHub 架構筆記：設計決策、管線演算法、領域模型"
code-notes/services       → "微服務相關的設計筆記"
code-notes/services/auth  → "認證服務的實作細節"
```

階層繼承規則：查詢 `code-notes/services/auth` 時，`ContextUseCase.checkContext()` 會匹配所有祖先路徑的 context：
1. `code-notes/services/auth`（精確匹配）
2. `code-notes/services`（父路徑）
3. `code-notes`（祖先路徑）

實作使用 SQL `LIKE` 查詢搭配前綴比對：對虛擬路徑的每個前綴段進行匹配。

## ContextUseCase API

`ContextUseCase` 提供四個操作：

| 方法 | 說明 |
|------|------|
| `addContext(virtualPath, description)` | 新增或更新 context（upsert 語意） |
| `listContexts()` | 列出所有已定義的 context |
| `checkContext(virtualPath)` | 查詢適用的 context（含階層繼承） |
| `removeContext(virtualPath)` | 刪除指定路徑的 context |
| `getContextsForDocPath(docPath)` | 根據文件路徑取得適用的 context 描述列表 |

`getContextsForDocPath()` 在搜尋結果豐富化時使用，將 context 描述注入 `SearchResult.contexts` 陣列。

## CLI 與 MCP 整合

### CLI 指令
```bash
# 新增 context
npx projecthub context add "code-notes" "ProjectHub 架構筆記"

# 列出所有 context
npx projecthub context list

# 查詢適用 context（含繼承）
npx projecthub context check "code-notes/services/auth"

# 刪除 context
npx projecthub context rm "code-notes"
```

### 搜尋結果中的 Context
搜尋結果的 `contexts` 欄位會包含所有適用的 context 描述。MCP 工具的輸出格式中，context 資訊幫助 AI 助手判斷搜尋結果的領域歸屬。

## 資料庫儲存

Context 儲存在 `path_contexts` 表：

```sql
CREATE TABLE path_contexts (
  context_id INTEGER PRIMARY KEY,
  virtual_path TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

`addContext()` 使用 `INSERT OR REPLACE` 語意，重複路徑會更新描述和 `updated_at` 時間戳。

## 相關文件

- [CLI 指令完整參考](../code-notes/cli-commands.md) — context 指令群組詳細選項
- [多階段搜尋管線](../code-notes/search-pipeline.md) — context 在搜尋結果中的使用
- [資料庫 Schema 完整說明](../structure/database-schema.md) — path_contexts 表結構
