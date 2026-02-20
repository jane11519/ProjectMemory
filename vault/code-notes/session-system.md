---
title: "Session 系統與 Summarization"
tags: [session, SessionUseCase, SessionPort, SessionSummary, TranscriptParser, VaultSessionAdapter, MCP, summarize, transcript, JSONL]
source_kind: code_note
date: 2026-02-20
---

# Session 系統與 Summarization

## 設計目的 Purpose

Session 系統追蹤 Claude Code 的對話歷程，並透過 MCP 工具實現「零成本摘要」——利用 Claude 本身（而非外部 LLM API）讀取 transcript 後生成結構化摘要，寫回 ProjectHub 資料庫。

這使得過去對話的設計決策、實作成果、待辦事項可被搜尋，實現跨 session 的知識累積。

## Session 生命週期

```
capture（擷取 transcript）→ active（進行中）
  → save（儲存快照）→ active
  → compact（壓縮摘要）→ compacted
  → summarize（Claude 生成摘要）→ closed
```

### 狀態轉換

| 狀態 | 說明 | 觸發條件 |
|------|------|---------|
| `active` | 進行中的 session | `session capture` 或 `session save` |
| `compacted` | 已壓縮滾動摘要 | `session compact` 或 token 超過閾值 |
| `closed` | 已完成結構化摘要 | MCP `session_update_summary` 寫入 summary |

## Transcript 擷取 — session capture

`session capture` CLI 指令從 Claude Code 的 JSONL 檔案中提取對話記錄：

1. 定位 Claude Code session 檔案（路徑由專案目錄 hash 決定）
2. `TranscriptParser` 解析 JSONL 格式，提取 `ConversationTurn`
3. 建立 rolling summary（截取最後 2000 字元）
4. 寫入 SQLite sessions 表

`TranscriptParser` 提取的資訊：
- `turns`: 每輪對話的角色（user/assistant）、文字、時間戳
- `toolsUsed`: 使用過的工具名稱（Write, Edit, Bash 等）
- `filesModified`: 修改過的檔案路徑（來自 Write/Edit/NotebookEdit 工具呼叫）
- 時間資訊：`startedAt`、`endedAt`（可計算 session 持續時間）

## Session 摘要工作流 — MCP Summarize Workflow

利用 Claude Code 本身做 session summarization 的三步驟 MCP 工作流：

### Step 1: 列出待摘要 Session
```
MCP: projecthub_session_list(hasSummary: false)
→ 回傳沒有 summary 的 session 列表
```

### Step 2: 讀取 Transcript
```
MCP: projecthub_session_transcript(sessionId?)
→ 回傳格式化的對話記錄（含 role、timestamp、tools、text）
→ 若省略 sessionId，自動選取最近的 session
```

### Step 3: 寫入結構化摘要
```
MCP: projecthub_session_update_summary(
  sessionId, overview, decisions, outcomes, openItems, tags
)
→ 寫入 sessions.summary_json
→ 匯出 vault/sessions/{date}_{sessionId}.md
```

Claude 讀取 transcript 後，以自身的理解能力生成摘要，不需要額外的 LLM API 呼叫費用。

## SessionSummary 結構

```typescript
interface SessionSummary {
  overview: string;       // 2-3 句話總結
  decisions: string[];    // 架構/設計決策及理由
  outcomes: string[];     // 成果（新增/修改的功能、檔案）
  openItems: string[];    // 待辦/未解決問題/下一步
  tags: string[];         // 主題標籤（用於 FTS5 搜尋）
}
```

## Vault Markdown 匯出

`VaultSessionAdapter.writeSessionMarkdown()` 將 session 資訊匯出為可索引的 Markdown 文件：

- 檔案路徑：`vault/sessions/{YYYY-MM-DD}_{sessionId}.md`
- Frontmatter 包含 `sessionId`、`projectDir`、時間戳、`turnCount`
- Body 格式：Overview → Decisions → Outcomes → Open Items → Tags
- 匯出後的 Markdown 文件可被 `index build` 索引，使 session 知識可搜尋

## SessionUseCase API

| 方法 | 說明 |
|------|------|
| `save(session)` | 儲存 session 快照（SQLite + vault MD） |
| `compact(sessionId)` | 壓縮 rolling summary（減少 token） |
| `listActive()` | 列出 active 狀態的 session |
| `listSessions(filter?)` | 帶過濾條件查詢（status、hasSummary、limit） |
| `updateSummary(sessionId, summary)` | 寫入結構化摘要 + 匯出 Markdown |
| `getTranscript(sessionId)` | 取得完整對話 transcript |

## 相關文件

- [MCP 工具完整參考](../code-notes/mcp-tools.md) — Session 相關 MCP tools 參數
- [CLI 指令完整參考](../code-notes/cli-commands.md) — session 指令群組
- [資料庫 Schema 完整說明](../structure/database-schema.md) — sessions 表結構
- [Claude Code 整合指南](../integrations/claude-code-integration.md) — hooks 與 transcript 路徑
