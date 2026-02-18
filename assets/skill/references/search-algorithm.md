# Search Algorithm

## Hybrid Fusion

1. **BM25 (lexical)**: FTS5 with field weights — title(8), heading_path(4), body(1), tags(2), properties(3)
2. **KNN (vector)**: sqlite-vec cosine similarity via `1 / (1 + distance)`
3. **Normalization**: Per-query max normalization (divide each score by the max in that result set)
4. **Fusion**: `finalScore = lexWeight * lexNorm + vecWeight * vecNorm` (default 0.7/0.3)

## FTS5 Query Sanitization

Each token is wrapped in double quotes to prevent FTS5 special characters (e.g., `-` as NOT) from causing syntax errors.

## Degradation Modes

| Mode | When | Behavior |
|------|------|----------|
| `hybrid` | Default | Both BM25 + vector |
| `bm25_only` | Vector fails or user request | Lexical only |
| `vec_only` | BM25 fails or user request | Vector only |

## Candidate Multiplier

Default `5x` — fetch 5 * topK candidates from each engine before fusion and final ranking.
