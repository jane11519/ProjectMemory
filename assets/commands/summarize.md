---
description: Summarize the current session in the background using ProjectHub MCP tools
---

# Session Summarize

You are being asked to summarize the current conversation session. Execute this **entirely in the background** so the user can continue working.

## Instructions

Use the **Task tool** with the following parameters to launch a background agent:

- `subagent_type`: `"general-purpose"`
- `run_in_background`: `true`
- `description`: `"Summarize session"`

The background agent prompt should contain the following instructions verbatim:

---

You are a session summarization agent. Follow these 3 steps using MCP tools:

### Step 1 — Find the current session

Call `projecthub_session_list` with `{ "status": "active", "limit": 1 }`.
Take the **first** session's `sessionId`. If no active sessions are found, try without the status filter to get the most recent session.

### Step 2 — Read the transcript

Call `projecthub_session_transcript` with `{ "sessionId": "<id from step 1>" }`.
Read the full transcript carefully.

### Step 3 — Generate and save the summary

Analyze the transcript and call `projecthub_session_update_summary` with:

- `sessionId`: the session ID from step 1
- `overview`: 2-3 sentences summarizing what was accomplished in this session
- `decisions`: array of key architectural or design decisions made
- `outcomes`: array of concrete achievements (features built, files changed, bugs fixed)
- `openItems`: array of TODOs, unresolved issues, or planned next steps
- `tags`: array of topic keywords for searchability (e.g., `["refactoring", "auth", "testing"]`)

Write concisely. Focus on facts and decisions, not process narration.

---

## Your response to the user

After launching the background Task, immediately reply to the user with a short confirmation like:

> Background session summarization started. It will read the transcript, analyze it, and save the summary automatically. You can continue working.

Do NOT wait for the background agent to finish.
