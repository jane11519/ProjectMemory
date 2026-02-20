# projmem

This project uses projmem as its knowledge base. The MCP tools `projmem_search`, `projmem_deep_search`, and `projmem_get` are available in all agent contexts.

## Subagent Instructions

When spawning Explore or Plan subagents (via the Task tool), always include this in their prompt:

> Before relying solely on Glob/Grep/Read, query the projmem knowledge base using `projmem_search` or `projmem_deep_search` for architectural context, past decisions, and documented patterns. Start with a keyword search for the topic, then use file exploration to fill gaps.

## When to Search projmem

- Understanding architecture or design decisions
- Working in a domain that has been discussed in past sessions
- Looking for conventions, patterns, or prior art
- Investigating how subsystems connect
