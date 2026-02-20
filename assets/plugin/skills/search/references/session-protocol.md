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
| status | TEXT | active / compacted / closed |

## Vault Export

Each session save writes a Markdown file to `vault/sessions/<date>_<session_id>.md` with:
- YAML frontmatter (session metadata)
- Rolling Summary section
- Decisions section (bulleted list)
- Search Footprint section (code-formatted queries)

## Compact Strategy

When rolling summary exceeds threshold:
1. Truncate to 500 characters at nearest sentence boundary
2. Update status to 'compacted'
3. Re-export Markdown file
