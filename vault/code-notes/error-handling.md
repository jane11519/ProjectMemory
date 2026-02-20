---
title: "錯誤處理與降級策略"
tags: [error-handling, graceful-degradation, NullLLMAdapter, fallback, resilience, StrongSignal, embedding-failure]
source_kind: code_note
date: 2026-02-20
---

# 錯誤處理與降級策略

## 設計原則 Design Principles

ProjectHub 的錯誤處理遵循「優雅降級」（Graceful Degradation）原則：當部分子系統不可用時，系統應回退到功能較少但仍可用的狀態，而非直接失敗。這對 MCP Server 尤為重要——AI 助手依賴搜尋結果，部分結果優於無結果。

核心降級路徑：
1. **完整功能**：BM25 + Vector + LLM（deep search 八階段管線）
2. **無 LLM**：BM25 + Vector（RRF 融合，跳過 expansion 和 reranking）
3. **無 Vector**：BM25-only（純全文搜尋）
4. **最低限度**：直接取 chunk（`projecthub_get` / `projecthub_multi_get`）

## Null Object Pattern — NullLLMAdapter

當 `llm.provider` 設為 `'none'` 時，系統注入 `NullLLMAdapter` 而非拋出錯誤。

```typescript
class NullLLMAdapter implements LLMPort {
  readonly providerId = 'null';
  async expandQuery(_query: string): Promise<string[]> { return []; }
  async rerank(_query: string, _candidates: ...): Promise<RerankResult[]> { return []; }
  async isAvailable(): Promise<boolean> { return false; }
}
```

**設計意圖**：消除 Use Case 層中大量的 `if (this.llm !== null)` 條件判斷。`SearchUseCase` 統一呼叫 `this.llm.isAvailable()`，NullLLMAdapter 回傳 `false`，deep search 管線自動跳過 expansion 和 reranking 階段。

## 搜尋管線降級策略

### Classic Search 降級

在 `classicSearch()` 中，BM25 和 Vector 搜尋各自 try-catch，失敗時自動切換模式：

| 原始模式 | BM25 失敗 | Vector 失敗 | 兩者皆失敗 |
|---------|----------|------------|-----------|
| `hybrid` | 降級為 `vec_only` | 降級為 `bm25_only` | 回傳空結果 |
| `bm25_only` | 回傳空結果 | N/A | N/A |
| `vec_only` | N/A | 回傳空結果 | N/A |

每次降級都會在 `SearchResponse.warnings` 中記錄原因，讓 MCP client 了解搜尋品質可能受影響。

### Deep Search 降級

Deep search 的八個階段各自獨立處理錯誤，不會因單一階段失敗而中斷整條管線：

| 階段 | 失敗時行為 | 影響 |
|------|----------|------|
| Stage 1: Initial BM25 | 記錄警告，繼續 | 失去 BM25 信號 |
| Stage 2: Strong Signal | 預設 false | 不影響（保守策略） |
| Stage 3: Query Expansion | 跳過，使用原始查詢 | 減少多查詢的召回增益 |
| Stage 4: Multi-Query | 各子查詢獨立 catch | 部分查詢仍可產生排名 |
| Stage 5: RRF Fusion | 至少一組排名即可融合 | 仍可排序 |
| Stage 6: LLM Reranking | 跳過，保留 RRF 排序 | 失去精排品質提升 |
| Stage 7: Blending | 降級為直接使用 RRF 分數 | 無 reranker 分數可混合 |
| Stage 8: Enrichment | chunk 查無資料時跳過 | 結果數可能略少 |

## Embedding 失敗處理

索引時的 embedding API 呼叫失敗（例如 rate limit、網路錯誤）不會中斷整個索引流程：

```
IndexUseCase.indexFile():
  1. 在 SQLite transaction 中寫入 doc + chunks + FTS5（同步）
  2. transaction 外呼叫 embedding API（非同步）
  3. 若 embedding 失敗 → stats.embeddingFailed = true
     → FTS5 索引仍可用，BM25 搜尋不受影響
     → warnings 記錄失敗原因
```

這意味著即使 embedding 服務完全不可用，BM25 全文搜尋仍然可以正常運作。使用者可在 embedding 服務恢復後重新執行 `index build` 補充向量資料。

## Embedding 維度不一致防護

`DatabaseManager` 在初始化時檢查 `schema_meta.embedding_dimension`。若偵測到新設定的 dimension 與資料庫中記錄不一致（例如從 1536 切換到 768），會拋出明確錯誤要求重建索引，防止混用不同維度的向量導致搜尋結果錯誤。

## FTS5 查詢安全處理

`FTS5Adapter.searchBM25()` 對查詢字串進行清理（sanitize），將每個 token 用雙引號包裹，防止 FTS5 特殊字元（如 `*`, `OR`, `NOT`）導致查詢語法錯誤。這確保使用者的任意輸入不會導致搜尋崩潰。

## 相關文件

- [多階段搜尋管線](../code-notes/search-pipeline.md) — 降級策略的詳細實作
- [領域介面（Ports）](../code-notes/domain-ports.md) — NullLLMAdapter 的 Port 定義
- [基礎設施層轉接器](../code-notes/infrastructure-adapters.md) — HttpLLMAdapter 的快取與重試機制
