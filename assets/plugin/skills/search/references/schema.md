# Database Schema

SQLite WAL mode with better-sqlite3 + sqlite-vec extension.

## Tables

| Table | Purpose |
|-------|---------|
| `namespaces` | Root, submodule, and directory namespaces |
| `docs` | Indexed Markdown documents with content_hash |
| `chunks` | Heading-based text chunks with line ranges |
| `chunks_fts` | FTS5 contentless virtual table for BM25 search |
| `chunks_vec` | vec0 virtual table for vector KNN search |
| `sessions` | Session state (rolling summary, decisions, search footprint) |
| `audit_log` | Index operation audit trail |

## Key Relationships

- `namespaces` 1:N `docs` (via namespace_id)
- `docs` 1:N `chunks` (via doc_id, CASCADE delete)
- `chunks.chunk_id` = `chunks_fts.rowid` = `chunks_vec.rowid`

## Indexes

- `idx_docs_namespace`, `idx_docs_content_hash`, `idx_docs_source_kind`
- `idx_chunks_doc_id`, `idx_chunks_text_hash`
- `idx_audit_timestamp`, `idx_audit_target`
