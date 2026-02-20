# ProjectHub

This project uses ProjectHub as its knowledge base. The MCP tools `projecthub_search`, `projecthub_deep_search`, and `projecthub_get` are available in all agent contexts.

## Subagent Instructions

When spawning Explore or Plan subagents (via the Task tool), always include this in their prompt:

> Before relying solely on Glob/Grep/Read, query the ProjectHub knowledge base using `projecthub_search` or `projecthub_deep_search` for architectural context, past decisions, and documented patterns. Start with a keyword search for the topic, then use file exploration to fill gaps.

## When to Search ProjectHub

- Understanding architecture or design decisions
- Working in a domain that has been discussed in past sessions
- Looking for conventions, patterns, or prior art
- Investigating how subsystems connect
