import type { Document } from '../entities/Document.js';
import type { Chunk } from '../entities/Chunk.js';
import type { Namespace } from '../entities/Namespace.js';

export interface IndexPort {
  // Namespace 操作
  upsertNamespace(ns: Namespace): number;
  getNamespaceByName(name: string): Namespace | undefined;
  listNamespaces(): Namespace[];

  // Document 操作
  upsertDoc(doc: Document): number;
  getDocByPath(docPath: string): Document | undefined;
  listDocsByNamespace(namespaceId: number): Document[];
  deleteDoc(docId: number): void;

  // Chunk 操作
  insertChunks(chunks: Chunk[]): void;
  getChunksByDocId(docId: number): Chunk[];
  getChunkById(chunkId: number): Chunk | undefined;
  deleteChunksByDocId(docId: number): void;

  // FTS5 操作
  insertFTSRows(rows: Array<{ chunkId: number; title: string; headingPath: string; body: string; tags: string; properties: string }>): void;
  deleteFTSRows(chunkIds: number[]): void;
  searchBM25(query: string, topK: number, namespaceId?: number): Map<number, number>;

  // Vector 操作
  insertVecRows(rows: Array<{ chunkId: number; embedding: Float32Array }>): void;
  deleteVecRows(chunkIds: number[]): void;
  searchKNN(queryVec: Float32Array, topK: number): Map<number, number>;

  // 交易控制
  transaction<T>(fn: () => T): T;

  // 審計
  writeAuditLog(entry: { actor: string; action: string; targetPath?: string; detailJson?: string }): void;

  // Context 操作
  addContext(virtualPath: string, description: string): number;
  listContexts(): Array<{ contextId: number; virtualPath: string; description: string }>;
  checkContext(virtualPath: string): Array<{ contextId: number; virtualPath: string; description: string }>;
  removeContext(virtualPath: string): boolean;
}
