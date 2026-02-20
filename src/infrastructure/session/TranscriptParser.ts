/**
 * TranscriptParser — 解析 Claude Code JSONL transcript 為結構化對話資料
 *
 * JSONL 格式：每行一個 JSON，包含 type, sessionId, slug, message, timestamp 等欄位。
 * 僅擷取 user 文字訊息與 assistant 文字/工具呼叫，跳過 progress/file-history-snapshot/tool_result。
 */

/** 單一對話回合 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  /** 純文字內容（去除 thinking/tool_use） */
  text: string;
  /** ISO datetime */
  timestamp: string;
  /** assistant 回合中使用的工具名稱 */
  toolNames?: string[];
}

/** 解析後的 transcript 摘要 */
export interface TranscriptSummary {
  sessionId: string;
  slug: string;
  turns: ConversationTurn[];
  /** user 訊息數 */
  turnCount: number;
  /** 對話開始時間（ms timestamp） */
  startedAt: number;
  /** 對話結束時間（ms timestamp） */
  endedAt: number;
  /** 所有使用過的工具（去重） */
  toolsUsed: string[];
  /** Write/Edit 的檔案路徑（去重） */
  filesModified: string[];
}

/** JSONL 行的最小型別（僅解析需要的欄位） */
interface TranscriptLine {
  type: string;
  sessionId?: string;
  slug?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * 解析 JSONL transcript 為結構化 TranscriptSummary
 *
 * @param jsonlContent - 完整 JSONL 文字內容（多行）
 * @returns TranscriptSummary，若無有效對話行則回傳 turnCount: 0
 */
export function parseTranscript(jsonlContent: string): TranscriptSummary {
  const lines = jsonlContent.split('\n').filter((l) => l.trim().length > 0);

  let sessionId = '';
  let slug = '';
  let firstTimestamp = '';
  let lastTimestamp = '';
  const turns: ConversationTurn[] = [];
  const allToolNames = new Set<string>();
  const allFilesModified = new Set<string>();

  /** 記錄 Write/Edit 操作的工具名稱 */
  const FILE_MODIFY_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

  for (const line of lines) {
    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      // 略過無法解析的行
      continue;
    }

    // 擷取 sessionId / slug（取第一個非空值）
    if (!sessionId && parsed.sessionId) sessionId = parsed.sessionId;
    if (!slug && parsed.slug) slug = parsed.slug;

    // 記錄首尾 timestamp
    if (parsed.timestamp) {
      if (!firstTimestamp) firstTimestamp = parsed.timestamp;
      lastTimestamp = parsed.timestamp;
    }

    // 跳過非對話類型
    if (parsed.type === 'progress' || parsed.type === 'file-history-snapshot') {
      continue;
    }

    const msg = parsed.message;
    if (!msg) continue;

    // --- User 訊息 ---
    if (parsed.type === 'user' && msg.role === 'user') {
      // 字串 content → 純文字使用者輸入
      if (typeof msg.content === 'string') {
        const text = msg.content.trim();
        if (text) {
          turns.push({
            role: 'user',
            text,
            timestamp: parsed.timestamp ?? '',
          });
        }
      }
      // 陣列 content → 可能是 tool_result，跳過（內容通常很大且非對話本體）
      // 不處理
      continue;
    }

    // --- Assistant 訊息 ---
    if (parsed.type === 'assistant' && msg.role === 'assistant') {
      if (!Array.isArray(msg.content)) continue;

      const textParts: string[] = [];
      const toolNames: string[] = [];

      for (const block of msg.content as ContentBlock[]) {
        if (block.type === 'text' && block.text) {
          const trimmed = block.text.trim();
          if (trimmed) textParts.push(trimmed);
        } else if (block.type === 'tool_use' && block.name) {
          toolNames.push(block.name);
          allToolNames.add(block.name);

          // 擷取 Write/Edit/NotebookEdit 的 file_path
          if (FILE_MODIFY_TOOLS.has(block.name) && block.input) {
            const filePath = block.input['file_path'] ?? block.input['notebook_path'];
            if (typeof filePath === 'string') {
              allFilesModified.add(filePath);
            }
          }
        }
        // 跳過 thinking 類型
      }

      // 僅當有文字或工具呼叫時才記錄為一個 turn
      if (textParts.length > 0 || toolNames.length > 0) {
        turns.push({
          role: 'assistant',
          text: textParts.join('\n'),
          timestamp: parsed.timestamp ?? '',
          toolNames: toolNames.length > 0 ? toolNames : undefined,
        });
      }
      continue;
    }
  }

  const startedAt = firstTimestamp ? new Date(firstTimestamp).getTime() : 0;
  const endedAt = lastTimestamp ? new Date(lastTimestamp).getTime() : 0;

  return {
    sessionId,
    slug,
    turns,
    turnCount: turns.filter((t) => t.role === 'user').length,
    startedAt,
    endedAt,
    toolsUsed: [...allToolNames].sort(),
    filesModified: [...allFilesModified],
  };
}
