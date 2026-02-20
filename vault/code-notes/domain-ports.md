---
title: "領域介面（Ports）"
tags: [domain, port, EmbeddingPort, IndexPort, LLMPort, VaultPort, SessionPort, dependency-inversion, hexagonal]
source_kind: code_note
date: 2026-02-20
---

# 領域介面（Ports）

## Port 設計原則

projmem 遵循 Hexagonal Architecture 的 Port-Adapter 模式：Domain 層定義 Port 介面，Infrastructure 層提供具體 Adapter 實作。Application 層的 Use Case 僅依賴 Port 介面，實現完全的依賴反轉。

這套設計帶來三項核心優勢：
1. **可測試性**：單元測試可注入 mock/stub，不需真實 DB 或 API
2. **可替換性**：例如從 OpenAI 切換到本地模型，只需替換 Adapter
3. **優雅降級**：Null Object Pattern（如 `NullLLMAdapter`）允許可選依賴不存在時系統仍正常運作

## EmbeddingPort — 嵌入向量產生

將文字轉換為密集向量（dense vector），用於語意搜尋的 KNN 查詢。

```typescript
interface EmbeddingResult {
  vector: Float32Array;   // 嵌入向量（維度由 model 決定）
  tokensUsed: number;     // 消耗的 token 數（用於成本追蹤）
}

interface EmbeddingPort {
  readonly providerId: string;   // 例如 "openai"
  readonly dimension: number;    // 例如 1536
  readonly modelId: string;      // 例如 "text-embedding-3-small"
  embed(texts: string[]): Promise<EmbeddingResult[]>;     // 批次嵌入
  embedOne(text: string): Promise<EmbeddingResult>;       // 單筆嵌入
  isHealthy(): Promise<boolean>;                          // 健康檢查
}
```

- **批次介面**：`embed()` 接受文字陣列，由 `EmbeddingBatcher` 分批處理（預設 `maxBatchSize: 100`）
- **dimension 追蹤**：dimension 寫入 `schema_meta` 表，DatabaseManager 啟動時驗證一致性
- **實作**：`OpenAIEmbeddingAdapter`（使用 OpenAI SDK，支援自訂 baseUrl）

## IndexPort — 索引讀寫操作

統一的索引資料存取介面，涵蓋 Namespace、Document、Chunk、FTS5、Vector、Context 和 Audit 操作。

```typescript
interface IndexPort {
  // Namespace CRUD
  upsertNamespace(ns: Namespace): number;
  getNamespaceByName(name: string): Namespace | undefined;
  listNamespaces(): Namespace[];

  // Document CRUD
  upsertDoc(doc: Document): number;
  getDocByPath(docPath: string): Document | undefined;
  listDocsByNamespace(namespaceId: number): Document[];
  deleteDoc(docId: number): void;

  // Chunk CRUD
  insertChunks(chunks: Chunk[]): void;
  getChunksByDocId(docId: number): Chunk[];
  getChunkById(chunkId: number): Chunk | undefined;
  deleteChunksByDocId(docId: number): void;

  // FTS5 全文搜尋
  insertFTSRows(rows: Array<{chunkId, title, headingPath, body, tags, properties}>): void;
  deleteFTSRows(chunkIds: number[]): void;
  searchBM25(query: string, topK: number, namespaceId?: number): Map<number, number>;

  // Vector 向量搜尋
  insertVecRows(rows: Array<{chunkId, embedding: Float32Array}>): void;
  deleteVecRows(chunkIds: number[]): void;
  searchKNN(queryVec: Float32Array, topK: number): Map<number, number>;

  // 交易控制
  transaction<T>(fn: () => T): T;

  // 審計
  writeAuditLog(entry: {actor, action, targetPath?, detailJson?}): void;

  // Context 階層式 metadata
  addContext(virtualPath: string, description: string): number;
  listContexts(): Array<{contextId, virtualPath, description}>;
  checkContext(virtualPath: string): Array<{contextId, virtualPath, description}>;
  removeContext(virtualPath: string): boolean;
}
```

此 Port 在實務中由 `SearchUseCase` 直接使用 `better-sqlite3` Database 物件與 `FTS5Adapter` / `SqliteVecAdapter` 分別操作（而非單一 IndexPort 實作），因為搜尋管線需要精細控制各子系統。

## LLMPort — LLM 抽象介面

將 LLM 操作（Query Expansion、Re-ranking）抽象為 Port，支援 deep search 模式的兩個 LLM 依賴步驟。

```typescript
interface RerankResult {
  chunkId: number;
  relevanceScore: number;   // 0.0 ~ 1.0
  reasoning?: string;       // LLM 給出的相關性理由
}

interface LLMPort {
  readonly providerId: string;
  expandQuery(query: string): Promise<string[]>;       // 查詢擴展（通常回傳 2 組替代查詢）
  rerank(query: string, candidates: Array<{chunkId, text}>): Promise<RerankResult[]>;  // 重排
  isAvailable(): Promise<boolean>;                     // 服務可用性檢查
}
```

- **Query Expansion**：將使用者查詢改寫為 2 組語意相近但用詞不同的替代查詢，增加搜尋召回
- **Re-ranking**：對 RRF 融合後的 top-K 候選結果進行 LLM 精排，給出 0-1 相關性分數
- **兩種實作**：
  - `HttpLLMAdapter`: 呼叫 OpenAI-compatible API（支援 `chat` 和 `endpoint` 兩種 reranker 策略）
  - `NullLLMAdapter`: 空實作，所有方法回傳空結果或 false（provider = 'none' 時使用）

## VaultPort — 檔案系統操作

抽象化所有檔案 I/O，使 Application 層不直接依賴 `fs` 模組。

```typescript
interface FileInfo {
  path: string;
  size: number;
  mtimeMs: number;
}

interface VaultPort {
  fileExists(filePath: string): Promise<boolean>;
  directoryExists(dirPath: string): Promise<boolean>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  listMarkdownFiles(dirPath: string): Promise<string[]>;
  getFileInfo(filePath: string): Promise<FileInfo>;
  globDirectories(rootDir: string, pattern: string): Promise<string[]>;
  readDirtyFiles(dirtyFilePath: string): Promise<string[]>;
  clearDirtyFiles(dirtyFilePath: string): Promise<void>;
  appendDirtyFile(dirtyFilePath: string, filePath: string): Promise<void>;
  ensureDirectory(dirPath: string): Promise<void>;
}
```

- `listMarkdownFiles()`: 遞迴走訪目錄（跳過隱藏目錄），回傳所有 `.md` 檔案路徑
- `readDirtyFiles()` / `clearDirtyFiles()` / `appendDirtyFile()`: 管理增量索引的 dirty file list
- `globDirectories()`: 用於 `ScanUseCase` 偵測 monorepo namespace

## SessionPort — Session 持久化

管理 Session 的 SQLite 儲存與 vault Markdown 匯出。

```typescript
interface SessionListFilter {
  status?: SessionStatus;
  hasSummary?: boolean;   // true = 有 summary, false = 無 summary
  limit?: number;
}

interface SessionPort {
  saveSession(session: Session): void;
  getSession(sessionId: string): Session | undefined;
  listActiveSessions(): Session[];
  listSessions(filter?: SessionListFilter): Session[];
  updateSession(sessionId: string, updates: Partial<Session>): void;
  writeSessionMarkdown(session: Session, vaultSessionsDir: string): Promise<void>;
}
```

- `writeSessionMarkdown()`: 將 session 摘要匯出為 vault/sessions/ 下的 Markdown 檔案，檔名格式 `{date}_{sessionId}.md`
- `listSessions()`: 支援 `hasSummary` 過濾，MCP tool `projmem_session_list` 用此篩選未摘要的 session

## 相關文件

- [領域模型與值物件](../code-notes/domain-model.md) — Port 操作的 Entity 定義
- [基礎設施層轉接器](../code-notes/infrastructure-adapters.md) — Port 的具體 Adapter 實作
- [錯誤處理與降級策略](../code-notes/error-handling.md) — NullLLMAdapter 與優雅降級
