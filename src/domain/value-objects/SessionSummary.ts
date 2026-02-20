/**
 * SessionSummary — 結構化 session 摘要
 *
 * 由 Claude（MCP client）讀取 transcript 後生成，
 * 透過 MCP tool 寫回 SQLite + vault Markdown。
 * 不依賴外部 LLM，利用 Claude 本身做 summarization。
 */
export interface SessionSummary {
  /** 2-3 句話總結這次對話完成了什麼 */
  overview: string;
  /** 架構/設計決策及其理由 */
  decisions: string[];
  /** 成果：新增/修改了什麼功能、檔案 */
  outcomes: string[];
  /** 待辦/未解決問題/下一步 */
  openItems: string[];
  /** 主題標籤（用於搜尋） */
  tags: string[];
}
