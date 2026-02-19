export const PRAGMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -64000;
`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS namespaces (
  namespace_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('submodule','directory','root')),
  git_url TEXT,
  git_commit TEXT,
  discovered_at INTEGER NOT NULL,
  last_scanned_at INTEGER
);

CREATE TABLE IF NOT EXISTS docs (
  doc_id INTEGER PRIMARY KEY,
  namespace_id INTEGER NOT NULL DEFAULT 1,
  doc_path TEXT NOT NULL UNIQUE,
  ref_code_path TEXT,
  source_kind TEXT NOT NULL DEFAULT 'code_note'
    CHECK(source_kind IN ('code_note','rule','integration_doc','dir_map','session','other')),
  title TEXT,
  content_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  frontmatter_json TEXT,
  indexed_at INTEGER NOT NULL,
  FOREIGN KEY(namespace_id) REFERENCES namespaces(namespace_id)
);

CREATE TABLE IF NOT EXISTS chunks (
  chunk_id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  token_estimate INTEGER,
  FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  title,
  heading_path,
  body,
  tags,
  properties,
  content='',
  contentless_delete=1,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS audit_log (
  log_id INTEGER PRIMARY KEY,
  timestamp_ms INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_path TEXT,
  namespace_id INTEGER,
  detail_json TEXT,
  content_hash_before TEXT,
  content_hash_after TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_dir TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_saved_at INTEGER NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  rolling_summary TEXT,
  decisions_json TEXT,
  search_footprint_json TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','compacted','closed'))
);

CREATE TABLE IF NOT EXISTS llm_cache (
  cache_key TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS path_contexts (
  context_id INTEGER PRIMARY KEY,
  virtual_path TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_namespace ON docs(namespace_id);
CREATE INDEX IF NOT EXISTS idx_docs_content_hash ON docs(content_hash);
CREATE INDEX IF NOT EXISTS idx_docs_source_kind ON docs(source_kind);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_text_hash ON chunks(text_hash);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_path);
`;

/**
 * sqlite-vec 的 vec0 虛擬表需要在 extension 載入後才能建立
 * dimension 由設定決定
 */
export function vecTableSQL(dimension: number): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[${dimension}]);`;
}
