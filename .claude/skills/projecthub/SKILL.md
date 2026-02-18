---
description: "Project knowledge base: search code explanations, architecture decisions, session management"
triggers:
  - project knowledge
  - code explanation
  - search
  - find in notes
  - session
  - what do we know about
---

# ProjectHub — Project Knowledge Base

Manages an Obsidian-compatible vault of Markdown notes indexed with hybrid BM25+vector search. Provides persistent session memory, architectural decision tracking, and progressive disclosure of search results.

## Commands

| Command | Description |
|---------|-------------|
| `projecthub scan` | Detect namespaces and documents |
| `projecthub index build` | Full rebuild of search index |
| `projecthub index update` | Incremental update from dirty files |
| `projecthub search "<query>"` | Hybrid search (BM25 + vector) |
| `projecthub search expand <id>` | Show full text of a chunk |
| `projecthub search full <path>` | Show all chunks of a document |
| `projecthub session save` | Save current session state |
| `projecthub session compact` | Compress session rolling summary |
| `projecthub health` | Check index consistency |
| `projecthub health --fix` | Auto-repair index issues |

## Search Workflow

1. **Brief search** (for inline context):
   ```bash
   node dist/cli/index.js search "authentication" --level brief --format json
   ```

2. **Normal search** (default — snippets + scores):
   ```bash
   node dist/cli/index.js search "JWT token validation" --format json
   ```

3. **Expand a result** (full chunk text):
   ```bash
   node dist/cli/index.js search expand 42 --format json
   ```

4. **Full document** (all chunks):
   ```bash
   node dist/cli/index.js search full "code-notes/auth.md" --format json
   ```

## Session Protocol

- After each significant interaction, save session state
- Session data persists in SQLite and exports to `vault/sessions/` as Markdown
- Compact when rolling summary exceeds token threshold
- Sessions track: turn count, rolling summary, decisions, search footprint

## Architecture

- **Hybrid search**: BM25 (FTS5) weighted 0.7 + vector KNN (sqlite-vec) weighted 0.3
- **Progressive disclosure**: brief → normal → full detail levels
- **Graceful degradation**: vector failure → BM25-only; BM25 failure → vector-only
- **Content hashing**: SHA-256 for incremental indexing

## References

- [Search Algorithm](references/search-algorithm.md)
- [Database Schema](references/schema.md)
- [Vault Conventions](references/vault-conventions.md)
- [Session Protocol](references/session-protocol.md)
