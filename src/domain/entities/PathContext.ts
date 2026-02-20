/**
 * Path Context 實體
 *
 * 設計意圖：實現階層式 context metadata 系統。
 * Virtual path scheme: `projmem://code-notes/services/auth`
 * 子路徑自動繼承父路徑的 context（例如 auth 繼承 services 的 context）。
 */
export interface PathContext {
  contextId?: number;
  /** 虛擬路徑（例如 "code-notes/services/auth"） */
  virtualPath: string;
  /** Context 描述文字 */
  description: string;
  createdAt: number;
  updatedAt: number;
}
