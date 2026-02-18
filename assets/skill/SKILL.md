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
| `npx projecthub scan` | Detect namespaces and documents |
| `npx projecthub index build` | Full rebuild of search index |
| `npx projecthub index update` | Incremental update from dirty files |
| `npx projecthub search "<query>"` | Hybrid search (BM25 + vector) |
| `npx projecthub search expand <id>` | Show full text of a chunk |
| `npx projecthub search full <path>` | Show all chunks of a document |
| `npx projecthub session save` | Save current session state |
| `npx projecthub session compact` | Compress session rolling summary |
| `npx projecthub health` | Check index consistency |
| `npx projecthub health --fix` | Auto-repair index issues |

## Search Workflow

1. **Brief search** (for inline context):
   ```bash
   npx projecthub search "authentication" --level brief --format json
   ```

2. **Normal search** (default — snippets + scores):
   ```bash
   npx projecthub search "JWT token validation" --format json
   ```

3. **Expand a result** (full chunk text):
   ```bash
   npx projecthub search expand 42 --format json
   ```

4. **Full document** (all chunks):
   ```bash
   npx projecthub search full "code-notes/auth.md" --format json
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
