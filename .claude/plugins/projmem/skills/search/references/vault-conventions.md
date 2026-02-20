# Vault Conventions

## Directory Structure

```
vault/
  code-notes/      # Architecture, design decisions, code explanations
  rules/           # Project rules and conventions
  integrations/    # Third-party integration docs
  sessions/        # Auto-generated session Markdown files
  structure/       # Directory maps, dependency graphs
  .projmem/
    index.db       # SQLite database (FTS5 + vec0)
    dirty-files.txt  # Modified file paths for incremental indexing
```

## Document Format

All documents are Markdown with optional YAML frontmatter:

```markdown
---
title: "Authentication Service"
tags: [auth, jwt, security]
ref_code_path: "src/auth/"
---

# Authentication Service

Content here...
```

## Namespace Detection

1. **Root**: Always present as default namespace
2. **Submodules**: Detected from `.gitmodules`
3. **Directories**: Matched against patterns like `services/*`, `packages/*`

## Content Hashing

SHA-256 hash of file content is stored in `docs.content_hash` for dirty detection during incremental indexing.
