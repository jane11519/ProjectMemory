# Session Protocol

## Lifecycle

```
active → compacted → closed
```

- **active**: Session is in progress, accumulating turns
- **compacted**: Rolling summary has been compressed to reduce tokens
- **closed**: Session is finished

## Data Model

| Field | Type | Description |
|-------|------|-------------|
| session_id | TEXT | Unique session identifier |
| project_dir | TEXT | Project root directory path |
| turn_count | INTEGER | Number of interaction turns |
| rolling_summary | TEXT | Accumulated context summary |
| decisions_json | TEXT | JSON array of architectural decisions |
| search_footprint_json | TEXT | JSON array of search queries performed |
| summary_json | TEXT | JSON-stringified SessionSummary (structured summary by Claude) |
| status | TEXT | active / compacted / closed |

### SessionSummary Structure

When `summary_json` is populated, it contains:

```typescript
interface SessionSummary {
  overview: string;       // 2-3 sentence summary
  decisions: string[];    // architectural/design decisions
  outcomes: string[];     // what was achieved
  openItems: string[];    // TODOs, unresolved issues
  tags: string[];         // topic tags for searchability
}
```

## Vault Export

Each session save writes a Markdown file to `vault/sessions/<date>_<session_id>.md` with:
- YAML frontmatter (session metadata)
- Summary section (when available): Overview, Key Decisions, Outcomes, Open Items, Tags
- Rolling Summary section
- Decisions section (bulleted list)
- Search Footprint section (code-formatted queries)

## Compact Strategy

When rolling summary exceeds threshold:
1. Truncate to 500 characters at nearest sentence boundary
2. Update status to 'compacted'
3. Re-export Markdown file

## Session Summarize

Generate structured summaries using Claude as the summarizer (zero external LLM cost):

### MCP Tools

| Tool | Purpose |
|------|---------|
| `projecthub_session_list` | List sessions with hasSummary filter |
| `projecthub_session_transcript` | Read full conversation transcript |
| `projecthub_session_update_summary` | Save structured summary |

### Workflow

1. `projecthub_session_list` with `hasSummary: false` to find unsummarized sessions
2. `projecthub_session_transcript` to read the full conversation
3. Claude generates structured summary from the transcript
4. `projecthub_session_update_summary` to persist the summary

### Trigger Options

- **Manual**: `/session-summarize` skill
- **Auto-reminder**: Check for unsummarized sessions at conversation start

### Transcript Storage

Original JSONL transcripts are backed up to `vault/.projecthub/transcripts/<sessionId>.jsonl` by `session capture`.
