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

# projmem — Project Knowledge Base

Manages an Obsidian-compatible vault of Markdown notes indexed with hybrid BM25+vector search. Provides persistent session memory, architectural decision tracking, progressive disclosure of search results, and MCP tool integration.

## Commands

| Command | Description |
|---------|-------------|
| `npx projmem scan` | Detect namespaces and documents |
| `npx projmem index build` | Full rebuild of search index |
| `npx projmem index update` | Incremental update from dirty files |
| `npx projmem search "<query>"` | Hybrid search (BM25 + vector) |
| `npx projmem search "<query>" --mode deep` | Deep search (expansion + RRF + re-ranking) |
| `npx projmem search expand <id>` | Show full text of a chunk |
| `npx projmem search full <path>` | Show all chunks of a document |
| `npx projmem session save` | Save current session state |
| `npx projmem session compact` | Compress session rolling summary |
| `npx projmem context add <path> <desc>` | Add context metadata |
| `npx projmem context list` | List all contexts |
| `npx projmem context check <path>` | Check applicable contexts |
| `npx projmem health` | Check index consistency |
| `npx projmem health --fix` | Auto-repair index issues |
| `npx projmem mcp` | Start MCP server (stdio) |
| `npx projmem mcp --http` | Start MCP server (HTTP) |

## MCP Tools

When running as an MCP server, the following tools are available:

| MCP Tool | CLI Equivalent | Best For |
|----------|---------------|----------|
| `projmem_search` | `search --mode bm25_only` | Known keywords, exact terms, identifiers |
| `projmem_vector_search` | `search --mode vec_only` | Conceptual queries, semantic similarity |
| `projmem_deep_search` | `search --mode deep` | Complex research, multi-aspect queries |
| `projmem_get` | `search expand <id>` | Retrieve specific chunk or document |
| `projmem_multi_get` | — | Batch retrieve multiple items |
| `projmem_status` | `health` | Index stats and health check |

## Score Interpretation

| Score Range | Meaning | Action |
|-------------|---------|--------|
| 0.8 – 1.0 | Highly relevant | Directly answers the query |
| 0.5 – 0.8 | Moderately relevant | Contains related information |
| 0.2 – 0.5 | Low relevance | Tangentially related, skim only |
| < 0.2 | Not useful | Skip |

## Recommended Search Workflow

Use a progressive escalation strategy:

1. **Start with keyword search** — fast, precise for known terms:
   ```bash
   npx projmem search "JWT validation" --format json
   ```

2. **Try semantic search** — when keywords miss the intent:
   ```bash
   npx projmem search "how to authenticate users" --mode vec_only --format json
   ```

3. **Use deep search** — for complex research questions:
   ```bash
   npx projmem search "authentication architecture decisions" --mode deep --format json
   ```

4. **Expand a result** — get full text of a relevant chunk:
   ```bash
   npx projmem search expand 42 --format json
   ```

5. **Full document** — read the entire document:
   ```bash
   npx projmem search full "code-notes/auth.md" --format json
   ```

## Context Metadata

projmem supports hierarchical context metadata. Contexts are attached to virtual paths and inherited by child paths.

```bash
# Add context
npx projmem context add "code-notes/services/auth" "Authentication service: JWT, OAuth2, RBAC"

# Check applicable contexts (includes ancestors)
npx projmem context check "code-notes/services/auth/jwt.md"
```

Search results include applicable context metadata when available.

## Session Protocol

- After each significant interaction, save session state
- Session data persists in SQLite and exports to `vault/sessions/` as Markdown
- Compact when rolling summary exceeds token threshold
- Sessions track: turn count, rolling summary, decisions, search footprint

## Architecture

- **Search pipeline**: BM25 + Vector → RRF fusion (or linear weighted)
- **Deep search**: Query Expansion → Multi-query search → RRF fusion → LLM Re-ranking → Position-aware blending
- **Progressive disclosure**: brief → normal → full detail levels
- **Graceful degradation**: vector failure → BM25-only; BM25 failure → vector-only; no LLM → RRF-only
- **Content hashing**: SHA-256 for incremental indexing
- **Context inheritance**: Child paths inherit parent context metadata

## Autonomous Behavior

### Proactive Search

Automatically search the knowledge base (without explicit user request) when:

- Implementing features in previously discussed domains
- Working with documented APIs or integrations
- User mentions architecture-related topics
- Fixing bugs — search for known issues and solutions

### Proactive Capture

Suggest writing to vault when detecting:

- Architecture decisions and their reasoning
- API specifications and integration notes
- Technical trade-off analyses
- Known issues and workarounds
- User preferences and project conventions

### What NOT to Capture

- One-off debug sessions
- Isolated code snippets
- General programming knowledge
- Volatile, short-lived information

## References

- [Search Algorithm](references/search-algorithm.md)
- [Database Schema](references/schema.md)
- [Vault Conventions](references/vault-conventions.md)
- [Session Protocol](references/session-protocol.md)
