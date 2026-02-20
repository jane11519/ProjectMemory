---
title: "領域模型與值物件"
tags: [domain, entity, value-object, Chunk, Document, Namespace, Session, PathContext, SearchResult, ContentHash, HybridScore, RRFScore, StrongSignal, SessionSummary]
source_kind: code_note
date: 2026-02-20
---

# 領域模型與值物件

## 設計哲學 Design Philosophy

projmem 的 Domain 層遵循 DDD（Domain-Driven Design）原則，將核心業務概念建模為 Entity 與 Value Object。所有外部依賴透過 Port 介面隔離，Domain 層完全無外部套件依賴（僅用 Node.js 內建 `crypto`）。

Entity 以 interface 定義（而非 class），因為它們主要是資料載體，行為由 Use Case 層編排。Value Object 則使用 class 實作，封裝不可變的領域邏輯（例如分數融合演算法）。

## Entity: Document

`Document` 代表 vault 中的一份 Markdown 文件。`SourceKind` 分類標籤對應 vault 子目錄，用於搜尋過濾與 MCP 狀態報告。

```typescript
type SourceKind = 'code_note' | 'rule' | 'integration_doc' | 'dir_map' | 'session' | 'other';

interface Document {
  docId?: number;          // DB 自增主鍵（新建時可省略）
  namespaceId: number;     // 所屬命名空間
  docPath: string;         // vault 相對路徑（例如 "code-notes/search-pipeline.md"）
  refCodePath?: string;    // 對應的原始碼路徑（選填）
  sourceKind: SourceKind;  // 分類標籤
  title: string;           // 文件標題（來自 frontmatter 或 H1）
  contentHash: string;     // SHA-256 雜湊（增量索引偵測用）
  fileSize: number;
  mtimeMs: number;
  frontmatterJson?: string; // YAML frontmatter 的 JSON 序列化
  indexedAt: number;        // 索引時間戳（epoch ms）
}
```

`contentHash` 是增量索引的關鍵：`IndexUseCase.buildIncremental()` 比對新舊 hash，相同則跳過處理，不同則刪除舊 chunks 後重新索引。

## Entity: Chunk

`Chunk` 是文件的最小可搜尋單位。每個 chunk 由 `ChunkingStrategy` 根據 Markdown heading 切割產生。

```typescript
interface Chunk {
  chunkId?: number;
  docId: number;           // 所屬文件
  chunkIndex: number;      // 在文件中的排序位置（0-based）
  headingPath: string;     // heading 層級路徑（空格分隔）
  startLine: number;       // 起始行號（1-based）
  endLine: number;         // 結束行號（inclusive）
  text: string;            // chunk 原文
  textHash: string;        // chunk 內容的 SHA-256
  tokenEstimate?: number;  // 近似 token 數（text.length / 4）
}
```

`headingPath` 範例：文件 heading 為 `# Search Pipeline > ## Stage 5: RRF` 時，headingPath = `"Search Pipeline Stage 5: RRF"`。此路徑同時作為 FTS5 `heading_path` 欄位（權重 4.0）。

## Entity: Namespace

`Namespace` 支援 monorepo 結構，將不同子模組或目錄的文件分組管理。

```typescript
type NamespaceKind = 'submodule' | 'directory' | 'root';

interface Namespace {
  namespaceId?: number;
  name: string;              // 唯一名稱
  kind: NamespaceKind;       // root: 專案根, submodule: git submodule, directory: monorepo 子目錄
  gitUrl?: string;           // submodule 的遠端 URL
  gitCommit?: string;        // submodule 的 commit SHA
  discoveredAt: number;
  lastScannedAt?: number;
}
```

`ScanUseCase` 透過設定中的 `namespacePatterns`（例如 `['services/*', 'packages/*']`）自動偵測目錄型命名空間。初始化時會建立一個 `root` 命名空間（namespace_id = 1）。

## Entity: SearchResult

`SearchResult` 是搜尋管線的最終輸出，攜帶多種分數用於排名與除錯。

```typescript
interface SearchResult {
  chunkId: number;
  docPath: string;
  title: string;
  headingPath: string;
  startLine: number;
  endLine: number;
  namespaceName: string;
  finalScore: number;     // 最終排名分數
  lexNorm: number;        // 正規化 BM25 分數（linear 模式）
  vecNorm: number;        // 正規化向量相似度（linear 模式）
  snippet?: string;       // 前 200 字元預覽
  text?: string;          // chunk 全文
  rrfScore?: number;      // RRF 融合分數（rrf 模式）
  rerankerScore?: number; // LLM 重排分數（deep 模式）
  contexts?: string[];    // 適用的階層 context metadata
}
```

## Entity: Session 與 PathContext

`Session` 追蹤 Claude Code 的對話狀態。`PathContext` 提供虛擬路徑的 context 描述，支援階層繼承。

- **Session**: `status` 生命週期為 `active → compacted → closed`。`summaryJson` 儲存由 Claude 透過 MCP tool 寫入的結構化摘要。
- **PathContext**: `virtualPath`（例如 `"code-notes/services/auth"`）搭配 `ContextUseCase.checkContext()` 實現階層繼承，查詢時自動匹配所有祖先路徑的 context。

## Value Object: ContentHash

不可變的 SHA-256 雜湊值物件，用於內容變更偵測。

```typescript
class ContentHash {
  static fromText(text: string): ContentHash;  // 計算 SHA-256
  static fromHex(hex: string): ContentHash;    // 從既有 hex 建立
  equals(other: ContentHash): boolean;         // 比較相等性
}
```

在索引管線中，每個 Document 和 Chunk 都有自己的 ContentHash。Document 層級用於增量索引（`buildIncremental`），Chunk 層級（`text_hash`）預留未來更細粒度的增量更新。

## Value Object: HybridScore

Linear 加權融合策略。對 BM25 和 Vector 分數進行 per-query max normalization 後，以可設定的權重線性組合。

```typescript
class HybridScore {
  static fuse(
    lexScores: Map<number, number> | null,
    vecScores: Map<number, number> | null,
    lexWeight: number,   // 預設 0.7
    vecWeight: number,   // 預設 0.3
  ): RankedResult[];
}
```

正規化公式：`score_norm = raw / max(all_raw_scores)`。融合公式：`final = lexWeight × lexNorm + vecWeight × vecNorm`。Per-query max normalization 確保不同查詢的分數可比較。

## Value Object: RRFScore

Reciprocal Rank Fusion（RRF）分數融合，使用排名而非原始分數，不受量級差異影響。

核心公式：`score = Σ(weight / (k + rank + 1))`

- `k = 60`: 平滑常數，降低高排名結果的影響力差異
- 原始查詢權重 2.0×，擴展查詢 1.0×
- Top-rank bonus: rank #1 → +0.05, rank #2-3 → +0.02

`RRFScore.fromScoreMap()` 將原始分數 Map 轉為排名列表，供 `fuse()` 方法使用。在 deep search 模式下，最多 6 組排名列表（3 queries × BM25 + Vector）進行 RRF 融合。

## Value Object: StrongSignal

強訊號偵測，決定是否跳過 Query Expansion 以節省 LLM 呼叫成本。

偵測條件（兩者皆須滿足）：
1. 最高正規化 BM25 分數 ≥ `minScore`（預設 0.85）
2. 最高分與第二高分的差距 ≥ `minGap`（預設 0.15）

當第一名結果遠超其他結果時，表示 BM25 已找到高度相關的結果，不需要 LLM 擴展查詢來增加召回。

## Value Object: SessionSummary

結構化的 session 摘要，由 Claude（MCP client）讀取 transcript 後生成，透過 `projmem_session_update_summary` MCP tool 寫回。

```typescript
interface SessionSummary {
  overview: string;       // 2-3 句話總結
  decisions: string[];    // 架構/設計決策
  outcomes: string[];     // 成果：新增/修改的功能、檔案
  openItems: string[];    // 待辦/未解決問題
  tags: string[];         // 主題標籤（用於搜尋）
}
```

此摘要不依賴外部 LLM，利用 Claude 本身做 summarization，實現零成本的 session 知識萃取。

## 相關文件

- [領域介面（Ports）](../code-notes/domain-ports.md) — Entity 操作的抽象介面
- [多階段搜尋管線](../code-notes/search-pipeline.md) — Value Object 在搜尋中的應用
- [資料庫 Schema 完整說明](../structure/database-schema.md) — Entity 到表的映射
