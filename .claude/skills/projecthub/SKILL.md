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

Manages an Obsidian-compatible vault of Markdown notes indexed with hybrid BM25+vector search. Provides persistent session memory, architectural decision tracking, progressive disclosure of search results, and MCP tool integration.

## Commands

| Command | Description |
|---------|-------------|
| `npx projecthub scan` | Detect namespaces and documents |
| `npx projecthub index build` | Full rebuild of search index |
| `npx projecthub index update` | Incremental update from dirty files |
| `npx projecthub search "<query>"` | Hybrid search (BM25 + vector) |
| `npx projecthub search "<query>" --mode deep` | Deep search (expansion + RRF + re-ranking) |
| `npx projecthub search expand <id>` | Show full text of a chunk |
| `npx projecthub search full <path>` | Show all chunks of a document |
| `npx projecthub session save` | Save current session state |
| `npx projecthub session compact` | Compress session rolling summary |
| `/session-summarize` | Generate structured summary via Claude (MCP) |
| `npx projecthub context add <path> <desc>` | Add context metadata |
| `npx projecthub context list` | List all contexts |
| `npx projecthub context check <path>` | Check applicable contexts |
| `npx projecthub health` | Check index consistency |
| `npx projecthub health --fix` | Auto-repair index issues |
| `npx projecthub mcp` | Start MCP server (stdio) |
| `npx projecthub mcp --http` | Start MCP server (HTTP) |

## MCP Tools

When running as an MCP server, the following tools are available:

| MCP Tool | CLI Equivalent | Best For |
|----------|---------------|----------|
| `projecthub_search` | `search --mode bm25_only` | Known keywords, exact terms, identifiers |
| `projecthub_vector_search` | `search --mode vec_only` | Conceptual queries, semantic similarity |
| `projecthub_deep_search` | `search --mode deep` | Complex research, multi-aspect queries |
| `projecthub_get` | `search expand <id>` | Retrieve specific chunk or document |
| `projecthub_multi_get` | — | Batch retrieve multiple items |
| `projecthub_status` | `health` | Index stats and health check |
| `projecthub_session_list` | `session list` | List sessions with summary status |
| `projecthub_session_transcript` | — | Read full conversation transcript |
| `projecthub_session_update_summary` | — | Save structured session summary |

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
   npx projecthub search "JWT validation" --format json
   ```

2. **Try semantic search** — when keywords miss the intent:
   ```bash
   npx projecthub search "how to authenticate users" --mode vec_only --format json
   ```

3. **Use deep search** — for complex research questions:
   ```bash
   npx projecthub search "authentication architecture decisions" --mode deep --format json
   ```

4. **Expand a result** — get full text of a relevant chunk:
   ```bash
   npx projecthub search expand 42 --format json
   ```

5. **Full document** — read the entire document:
   ```bash
   npx projecthub search full "code-notes/auth.md" --format json
   ```

## Context Metadata

ProjectHub supports hierarchical context metadata. Contexts are attached to virtual paths and inherited by child paths.

```bash
# Add context
npx projecthub context add "code-notes/services/auth" "Authentication service: JWT, OAuth2, RBAC"

# Check applicable contexts (includes ancestors)
npx projecthub context check "code-notes/services/auth/jwt.md"
```

Search results include applicable context metadata when available.

## Session Protocol

- After each significant interaction, save session state
- Session data persists in SQLite and exports to `vault/sessions/` as Markdown
- Compact when rolling summary exceeds token threshold
- Sessions track: turn count, rolling summary, decisions, search footprint

### Session Summarize

Use `/session-summarize` or the MCP tools directly to generate structured summaries:

1. `projecthub_session_list` (hasSummary: false) — find unsummarized sessions
2. `projecthub_session_transcript` — read the full conversation
3. Generate summary (overview, decisions, outcomes, openItems, tags)
4. `projecthub_session_update_summary` — save the structured summary

### Auto-Summarize Reminder

When starting a new conversation, check for unsummarized sessions:
- Use `projecthub_session_list` with `hasSummary: false`
- If found, offer to summarize the most recent one

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
