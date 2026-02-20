---
title: "Claude Code 整合指南"
tags: [claude-code, MCP, hooks, settings.json, .mcp.json, init, PostToolUse, TaskCompleted, Stop, skill, transcript, dirty-files]
source_kind: integration_doc
date: 2026-02-20
---

# Claude Code 整合指南

## 整合概覽 Integration Overview

ProjectHub 與 Claude Code 的整合包含三個層面：
1. **MCP Server**：透過 `.mcp.json` 註冊，提供 9 個搜尋/Session 工具
2. **Hooks**：透過 `.claude/settings.json` 註冊事件鉤子，自動追蹤文件變更
3. **Skills**：透過 `.claude/skills/projecthub/` 提供自訂技能腳本

## 一鍵初始化 — projecthub init

```bash
npx projecthub init [--repo-root <dir>]
```

`init` 指令自動完成所有整合設定：

### 1. Skill 檔案安裝

從 `assets/skill/` 複製檔案到目標專案的 `.claude/skills/projecthub/`，包含：
- 主要 skill 描述檔
- `scripts/track-dirty.sh`：追蹤 vault 文件變更
- `scripts/on-task-completed.sh`：任務完成時觸發增量索引
- `scripts/on-stop.sh`：session 結束時的清理動作

### 2. Hooks 設定

合併以下 hooks 到 `.claude/settings.json`：

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "bash .claude/skills/projecthub/scripts/track-dirty.sh \"$TOOL_INPUT_FILE_PATH\"",
        "timeout": 5
      }]
    }],
    "TaskCompleted": [{
      "hooks": [{
        "type": "command",
        "command": "bash .claude/skills/projecthub/scripts/on-task-completed.sh",
        "timeout": 120
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "bash .claude/skills/projecthub/scripts/on-stop.sh",
        "timeout": 60,
        "async": true
      }]
    }]
  }
}
```

**Hook 行為說明：**
- `PostToolUse`（matcher: `Write|Edit`）：當 Claude 使用 Write 或 Edit 工具修改檔案時，`track-dirty.sh` 檢查路徑是否在 vault 內，是則追加到 `dirty-files.txt`
- `TaskCompleted`：任務完成時觸發增量索引（`index update`），確保新寫入的文件立即可搜尋
- `Stop`：session 結束時的非同步清理（例如 session capture）

合併策略：以 `command` 字串去重，不覆蓋使用者已有的其他 hooks。

### 3. MCP Server 設定

在 `.mcp.json` 中新增 projecthub MCP server entry：

```json
{
  "mcpServers": {
    "projecthub": {
      "command": "npx",
      "args": ["-y", "projecthub", "mcp"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}",
        "OPENAI_BASE_URL": "${OPENAI_BASE_URL}"
      }
    }
  }
}
```

- `env` 中的 `${OPENAI_API_KEY}` 和 `${OPENAI_BASE_URL}` 會從系統環境變數取值
- `.mcp.json` 自動加入 `.gitignore`（含 API key，不應進版控）

### 4. 專案設定與 Vault

- 建立 `.projecthub.json`（從 DEFAULT_CONFIG 產生）
- 建立 vault 目錄結構（code-notes、rules、integrations、sessions、structure）
- 建立 vault/.gitignore（排除 SQLite DB 和暫存檔）
- 初始化 SQLite 資料庫

## Dirty File 追蹤機制

增量索引的核心機制：

```
Claude 修改 vault 文件
  → PostToolUse hook 觸發
  → track-dirty.sh 檢查路徑是否在 vault/ 內
  → 追加路徑到 vault/.projecthub/dirty-files.txt
  → TaskCompleted hook 觸發 index update
  → IndexUseCase.buildIncremental() 只處理 dirty files
  → 清空 dirty-files.txt
```

## Session 摘要工作流

利用 Claude 本身做 session summarization 的推薦工作流：

1. Session 結束前，使用 MCP 工具：
   ```
   projecthub_session_list(hasSummary: false)  → 找到待摘要的 session
   projecthub_session_transcript(sessionId)     → 讀取完整 transcript
   ```
2. Claude 閱讀 transcript 後生成結構化摘要
3. 寫入摘要：
   ```
   projecthub_session_update_summary(sessionId, overview, decisions, outcomes, openItems, tags)
   ```
4. 摘要自動匯出為 vault/sessions/ 下的 Markdown 文件，可被索引搜尋

## Transcript 路徑定位

Claude Code 的 session JSONL 檔案位置由專案目錄路徑 hash 決定：
- Windows：`%APPDATA%/Claude/projects/{encoded_path}/`
- macOS/Linux：`~/.config/Claude/projects/{encoded_path}/`

`session capture` 指令自動定位並解析最新的 JSONL 檔案。

## 相關文件

- [MCP 工具完整參考](../code-notes/mcp-tools.md) — 9 個 MCP 工具的參數與用法
- [CLI 指令完整參考](../code-notes/cli-commands.md) — init 指令的完整選項
- [Session 系統與 Summarization](../code-notes/session-system.md) — Session 生命週期
- [LLM 與 Embedding 提供者設定](../integrations/llm-providers.md) — API key 設定
