---
title: "多階段搜尋管線"
tags: [search, SearchUseCase, deep-search, BM25, FTS5, KNN, sqlite-vec, HybridScore, RRFScore, StrongSignal, query-expansion, reranking, position-aware-blending]
source_kind: code_note
date: 2026-02-20
---

# 多階段搜尋管線

## 搜尋模式總覽 Search Modes

`SearchUseCase` 支援四種搜尋模式，由 `SearchRequest.mode` 指定：

| 模式 | 搜尋引擎 | 融合策略 | LLM 依賴 | 適用場景 |
|------|---------|---------|---------|---------|
| `hybrid`（預設） | BM25 + Vector | Linear 或 RRF | 否 | 一般用途 |
| `bm25_only` | BM25 | 無 | 否 | 精確關鍵字搜尋 |
| `vec_only` | Vector | 無 | 否 | 純語意搜尋 |
| `deep` | BM25 + Vector | RRF + Blending | 是（可選） | 最高品質搜尋 |

`fusionMethod` 設定（預設 `'rrf'`）影響 `hybrid` 模式的融合策略。設為 `'linear'` 時使用 `HybridScore` 線性加權。

## Classic Search 模式

`classicSearch()` 處理 `hybrid`、`bm25_only`、`vec_only` 三種模式，流程簡潔：

1. **BM25 搜尋**（hybrid / bm25_only）：`FTS5Adapter.searchBM25(query, candidateK)`
2. **Vector 搜尋**（hybrid / vec_only）：`EmbeddingPort.embedOne(query)` → `SqliteVecAdapter.searchKNN(vec, candidateK)`
3. **分數融合**：依 `fusionMethod` 選擇 RRF 或 Linear 融合
4. **結果豐富化**：JOIN chunks + docs + namespaces 取得完整資訊

`candidateK = topK × candidateMultiplier`（預設 5 倍）確保融合有足夠候選。

### Linear 融合（HybridScore）

Per-query max normalization → 加權線性組合：
```
lexNorm = rawBM25 / max(allBM25)
vecNorm = rawVec / max(allVec)
finalScore = lexWeight × lexNorm + vecWeight × vecNorm
```
預設權重：`lexical: 0.7, vector: 0.3`。BM25 權重較高，因為 ProjectHub 的文件含大量技術關鍵字，精確匹配更重要。

### RRF 融合（hybrid 模式）

當 `fusionMethod: 'rrf'` 時，hybrid 模式也使用 RRF 融合（兩組排名：BM25 + Vector，權重各 1.0）。

## Deep Search 八階段管線

`deepSearch()` 實現完整的多階段搜尋管線，每個階段獨立計時與錯誤處理。

### Stage 1: Initial BM25 搜尋

使用原始查詢進行 FTS5 BM25 搜尋，取得 `candidateK` 個候選結果。此結果用於：
1. Stage 2 的強訊號偵測
2. Stage 4 的原始查詢 BM25 排名列表

### Stage 2: Strong Signal 強訊號檢查

使用 `StrongSignal.detect()` 分析 BM25 結果分佈：
- 條件 1：最高正規化分數 ≥ `strongSignalMinScore`（預設 0.85）
- 條件 2：Top-1 與 Top-2 的分數差距 ≥ `strongSignalMinGap`（預設 0.15）

若偵測到強訊號，跳過 Stage 3 Query Expansion，節省 LLM 呼叫成本。原理：當 BM25 已找到高度相關的唯一結果時，擴展查詢不會增加有價值的召回。

### Stage 3: Query Expansion 查詢擴展

呼叫 `LLMPort.expandQuery(query)` 將原始查詢改寫為 2 組語意相近但用詞不同的替代查詢。

跳過條件（任一滿足即跳過）：
1. `request.skipExpansion === true`（使用者明確要求跳過）
2. Stage 2 偵測到強訊號
3. LLM 不可用（`isAvailable() === false`）

`PipelineStageInfo.skipReason` 記錄具體原因：`'user_requested'`、`'strong_signal_detected'`、`'llm_unavailable'`。

### Stage 4: Multi-Query Search 多查詢搜尋

對原始查詢 + 擴展查詢分別執行 BM25 和 Vector 搜尋，產生最多 6 組排名列表：

```
allQueries = [originalQuery, ...expandedQueries]  // 最多 3 個查詢

for each query:
  BM25 → RankingList(weight = isOriginal ? 2.0 : 1.0)
  Vector → RankingList(weight = isOriginal ? 2.0 : 1.0)
```

原始查詢的權重為 2.0×（擴展查詢 1.0×），確保原始查詢的信號在融合中佔更大比重。

### Stage 5: RRF 融合

使用 `RRFScore.fuse(rankings, k=60)` 對所有排名列表進行 Reciprocal Rank Fusion：

```
score(chunk) = Σ(weight / (k + rank + 1))
```

加上 top-rank bonus：
- rank #1 → +0.05
- rank #2-3 → +0.02

輸出取 `rerankCandidateLimit`（預設 20）個最高分結果，作為 Stage 6 的輸入。

### Stage 6: LLM Re-ranking 重排

呼叫 `LLMPort.rerank(query, candidates)` 對 RRF top-K 候選進行精排。

- 先透過 `fetchCandidateTexts()` 從 DB 取得 chunk 全文
- LLM 對每個候選評估相關性，回傳 0.0-1.0 分數
- 支援兩種 reranker 策略（由 `HttpLLMAdapter` 實作）：
  - `'chat'`: 使用 Chat Completions API，prompt 要求打分
  - `'endpoint'`: 呼叫 `/v1/rerank` API（專用 cross-encoder reranker）

### Stage 7: Position-Aware Blending

將 RRF 分數與 Reranker 分數依位置加權混合：

| 位置 | RRF 權重 | Reranker 權重 | 設計意圖 |
|------|---------|-------------|---------|
| rank 1-3 | 0.75 | 0.25 | Top 結果信任 RRF（已跨多排名驗證） |
| rank 4-10 | 0.60 | 0.40 | 中段給 reranker 更多影響力 |
| rank 11+ | 0.40 | 0.60 | 尾段依賴 reranker 挖掘被 RRF 低估的結果 |

```
finalScore = rrfWeight × (rrfScore / maxRrf) + rerankerWeight × rerankerScore
```

混合後依 `finalScore` 重新排序，取 `topK` 個結果。

### Stage 8: Enrichment 結果豐富化

透過 SQL JOIN 取得每個 chunk 的完整資訊：
```sql
SELECT c.*, d.doc_path, d.title, n.name AS namespace_name
FROM chunks c
JOIN docs d ON c.doc_id = d.doc_id
JOIN namespaces n ON d.namespace_id = n.namespace_id
WHERE c.chunk_id = ?
```

產生 `snippet`（前 200 字元）和完整 `text`，組裝為 `SearchResult`。

## SearchResponse 結構

```typescript
interface SearchResponse {
  results: SearchResult[];
  searchMode: 'hybrid' | 'bm25_only' | 'vec_only' | 'deep';
  totalCandidates: number;    // 融合後的候選數量
  durationMs: number;         // 總耗時
  warnings: string[];         // 降級警告
  expandedQueries?: string[];       // 擴展查詢（deep 模式）
  strongSignalDetected?: boolean;   // 是否偵測到強訊號
  rerankApplied?: boolean;          // 是否套用了 reranking
  pipelineStages?: PipelineStageInfo[];  // 各階段計時
}
```

## 相關文件

- [領域模型與值物件](../code-notes/domain-model.md) — HybridScore、RRFScore、StrongSignal 詳細說明
- [索引管線與增量更新](../code-notes/indexing-pipeline.md) — 搜尋的資料來源如何建立
- [資料庫 Schema 完整說明](../structure/database-schema.md) — FTS5 與 vec0 表結構
- [MCP 工具完整參考](../code-notes/mcp-tools.md) — projecthub_search、deep_search 工具參數
