import path from 'node:path';
import type Database from 'better-sqlite3';
import type { FTS5Adapter } from '../infrastructure/sqlite/FTS5Adapter.js';
import type { SqliteVecAdapter } from '../infrastructure/sqlite/SqliteVecAdapter.js';
import type { MarkdownParser } from '../infrastructure/vault/MarkdownParser.js';
import type { ChunkingStrategy } from '../infrastructure/vault/ChunkingStrategy.js';
import type { VaultPort } from '../domain/ports/VaultPort.js';
import type { EmbeddingPort } from '../domain/ports/EmbeddingPort.js';
import type { IndexStats } from './dto/IndexStats.js';
import { ContentHash } from '../domain/value-objects/ContentHash.js';

/**
 * 索引用例：將 vault 中的 Markdown 檔案解析、切塊、嵌入，
 * 寫入 chunks / FTS5 / vec0 三張表
 */
export class IndexUseCase {
  constructor(
    private readonly db: Database.Database,
    private readonly fts5: FTS5Adapter,
    private readonly vec: SqliteVecAdapter,
    private readonly mdParser: MarkdownParser,
    private readonly chunker: ChunkingStrategy,
    private readonly vault: VaultPort,
    private readonly embedding: EmbeddingPort,
  ) {}

  /** 全量建索引 */
  async buildFull(
    repoRoot: string,
    vaultRoot: string,
    folders: string[],
  ): Promise<IndexStats> {
    const start = Date.now();
    const stats: IndexStats = {
      docsProcessed: 0, chunksCreated: 0,
      ftsRowsInserted: 0, vecRowsInserted: 0,
      docsSkipped: 0, docsDeleted: 0,
      embeddingFailed: false, warnings: [],
      durationMs: 0,
    };

    const vaultAbsPath = path.join(repoRoot, vaultRoot);

    // 收集所有 markdown 檔案
    const allFiles: string[] = [];
    for (const folder of folders) {
      const folderPath = path.join(vaultAbsPath, folder);
      if (await this.vault.directoryExists(folderPath)) {
        const files = await this.vault.listMarkdownFiles(folderPath);
        allFiles.push(...files);
      }
    }

    // 逐檔處理
    for (const filePath of allFiles) {
      await this.indexFile(filePath, vaultAbsPath, stats);
    }

    stats.durationMs = Date.now() - start;
    return stats;
  }

  /** 增量索引：只處理 dirty files */
  async buildIncremental(
    repoRoot: string,
    vaultRoot: string,
    dirtyFilePath: string,
  ): Promise<IndexStats> {
    const start = Date.now();
    const stats: IndexStats = {
      docsProcessed: 0, chunksCreated: 0,
      ftsRowsInserted: 0, vecRowsInserted: 0,
      docsSkipped: 0, docsDeleted: 0,
      embeddingFailed: false, warnings: [],
      durationMs: 0,
    };

    const vaultAbsPath = path.join(repoRoot, vaultRoot);
    const dirtyFiles = await this.vault.readDirtyFiles(dirtyFilePath);

    for (const filePath of dirtyFiles) {
      if (await this.vault.fileExists(filePath)) {
        // 檔案存在 → 檢查 hash 是否改變
        const content = await this.vault.readFile(filePath);
        const newHash = ContentHash.fromText(content).value;
        const relPath = path.relative(vaultAbsPath, filePath).replace(/\\/g, '/');

        const existingDoc = this.db.prepare(
          'SELECT doc_id, content_hash FROM docs WHERE doc_path = ?'
        ).get(relPath) as { doc_id: number; content_hash: string } | undefined;

        if (existingDoc && existingDoc.content_hash === newHash) {
          stats.docsSkipped++;
          continue;
        }

        // 刪除舊 chunks
        if (existingDoc) {
          this.deleteDocChunks(existingDoc.doc_id);
          this.db.prepare('DELETE FROM docs WHERE doc_id = ?').run(existingDoc.doc_id);
        }

        await this.indexFile(filePath, vaultAbsPath, stats);
      } else {
        // 檔案已刪除 → 移除相關資料
        const relPath = path.relative(vaultAbsPath, filePath).replace(/\\/g, '/');
        const existingDoc = this.db.prepare(
          'SELECT doc_id FROM docs WHERE doc_path = ?'
        ).get(relPath) as { doc_id: number } | undefined;

        if (existingDoc) {
          this.deleteDocChunks(existingDoc.doc_id);
          this.db.prepare('DELETE FROM docs WHERE doc_id = ?').run(existingDoc.doc_id);
          stats.docsDeleted++;
        }
      }
    }

    // 清除 dirty file
    await this.vault.clearDirtyFiles(dirtyFilePath);

    stats.durationMs = Date.now() - start;
    return stats;
  }

  /** 索引單一檔案 */
  private async indexFile(
    filePath: string,
    vaultAbsPath: string,
    stats: IndexStats,
  ): Promise<void> {
    const content = await this.vault.readFile(filePath);
    const fileInfo = await this.vault.getFileInfo(filePath);
    const parsed = this.mdParser.parse(content);
    const contentHash = ContentHash.fromText(content).value;
    const relPath = path.relative(vaultAbsPath, filePath).replace(/\\/g, '/');

    // 提取 title
    const title = (parsed.frontmatter.title as string)
      ?? /^#\s+(.+)$/m.exec(parsed.body)?.[1]?.trim()
      ?? path.basename(filePath, '.md');

    // 切塊
    const rawChunks = this.chunker.chunkByHeadings(relPath, parsed.body);
    if (rawChunks.length === 0) return;

    // 在交易中寫入 doc + chunks + FTS5
    const transaction = this.db.transaction(() => {
      // 插入 doc
      const docResult = this.db.prepare(`
        INSERT OR REPLACE INTO docs(namespace_id, doc_path, source_kind, title, content_hash, file_size, mtime_ms, frontmatter_json, indexed_at)
        VALUES(1, ?, 'code_note', ?, ?, ?, ?, ?, ?)
      `).run(
        relPath, title, contentHash,
        fileInfo.size, fileInfo.mtimeMs,
        JSON.stringify(parsed.frontmatter), Date.now(),
      );
      const docId = Number(docResult.lastInsertRowid);

      // 插入 chunks
      const chunkStmt = this.db.prepare(`
        INSERT INTO chunks(doc_id, chunk_index, heading_path, start_line, end_line, text, text_hash, token_estimate)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const chunkIds: number[] = [];
      const chunkTexts: string[] = [];

      for (const chunk of rawChunks) {
        const textHash = ContentHash.fromText(chunk.text).value;
        const tokenEstimate = Math.ceil(chunk.text.length / 4);
        const result = chunkStmt.run(
          docId, chunk.chunkIndex, chunk.headingPath,
          chunk.startLine, chunk.endLine, chunk.text,
          textHash, tokenEstimate,
        );
        chunkIds.push(Number(result.lastInsertRowid));
        chunkTexts.push(chunk.text);
        stats.chunksCreated++;
      }

      // 插入 FTS5 rows
      const ftsRows = rawChunks.map((chunk, i) => ({
        chunkId: chunkIds[i],
        title,
        headingPath: chunk.headingPath,
        body: chunk.text,
        tags: Array.isArray(parsed.frontmatter.tags)
          ? parsed.frontmatter.tags.join(',')
          : (parsed.frontmatter.tags ?? ''),
        properties: Object.entries(parsed.frontmatter)
          .filter(([k]) => k !== 'tags' && k !== 'title')
          .map(([k, v]) => `${k}:${v}`)
          .join(' '),
      }));
      this.fts5.insertRows(ftsRows);
      stats.ftsRowsInserted += ftsRows.length;

      return { chunkIds, chunkTexts };
    });

    const { chunkIds, chunkTexts } = transaction();
    stats.docsProcessed++;

    // Embedding（在交易外，因為是非同步 API 呼叫）
    try {
      const embedResults = await this.embedding.embed(chunkTexts);
      const vecRows = chunkIds.map((id, i) => ({
        chunkId: id,
        embedding: embedResults[i].vector,
      }));
      this.vec.insertRows(vecRows);
      stats.vecRowsInserted += vecRows.length;
    } catch (err: any) {
      stats.embeddingFailed = true;
      stats.warnings.push(`Embedding failed: ${err?.message ?? 'unknown'}. FTS5 index still available.`);
    }
  }

  /** 刪除文件相關的所有 chunk 資料 */
  private deleteDocChunks(docId: number): void {
    const chunks = this.db.prepare(
      'SELECT chunk_id FROM chunks WHERE doc_id = ?'
    ).all(docId) as Array<{ chunk_id: number }>;

    const chunkIds = chunks.map((c) => c.chunk_id);
    if (chunkIds.length > 0) {
      this.fts5.deleteRows(chunkIds);
      this.vec.deleteRows(chunkIds);
    }
    this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);
  }
}
