---
name: session-summarize
description: "Summarize a session transcript using ProjectHub MCP tools"
---

# Session Summarize

使用 ProjectHub MCP tools 為對話 session 生成結構化摘要。零外部 LLM 成本 — Claude 本身就是 summarizer。

## 步驟

1. 呼叫 `projecthub_session_list` 找到待 summarize 的 session（hasSummary: false）
2. 選擇要 summarize 的 session（預設最近一個）
3. 呼叫 `projecthub_session_transcript` 取得完整 transcript
4. 閱讀 transcript 後，生成結構化摘要：
   - **overview**: 2-3 句話總結這次對話的目標和成果
   - **decisions**: 列出所有架構/設計決策及其理由
   - **outcomes**: 列出具體成果（實作了什麼功能、修改了哪些檔案、修復了什麼問題）
   - **openItems**: 列出待辦事項、未解決問題、下一步計畫
   - **tags**: 給予 3-5 個主題標籤
5. 呼叫 `projecthub_session_update_summary` 儲存摘要

## 注意事項

- 若 transcript 不存在，提示使用者先執行 `session capture`
- 摘要應精煉有意義，避免逐字複述 transcript
- decisions 應包含決策的理由，不只是結論
- outcomes 應包含具體檔案名稱或功能描述
- openItems 應是可執行的待辦事項
- tags 應有助於未來搜尋
