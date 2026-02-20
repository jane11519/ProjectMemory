import { describe, it, expect } from 'vitest';
import { parseTranscript } from '../../../src/infrastructure/session/TranscriptParser.js';
import type { TranscriptSummary } from '../../../src/infrastructure/session/TranscriptParser.js';

/** 建構符合 Claude Code JSONL 格式的測試行 */
function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

function userTextLine(text: string, opts: Partial<{ sessionId: string; slug: string; timestamp: string }> = {}): string {
  return line({
    type: 'user',
    sessionId: opts.sessionId ?? 'test-session-id',
    slug: opts.slug ?? 'test-slug',
    timestamp: opts.timestamp ?? '2026-02-20T10:00:00.000Z',
    message: { role: 'user', content: text },
  });
}

function assistantTextLine(text: string, opts: Partial<{ timestamp: string }> = {}): string {
  return line({
    type: 'assistant',
    sessionId: 'test-session-id',
    slug: 'test-slug',
    timestamp: opts.timestamp ?? '2026-02-20T10:00:01.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text }],
    },
  });
}

function assistantToolUseLine(
  toolName: string,
  input: Record<string, unknown> = {},
  opts: Partial<{ timestamp: string; extraContent: unknown[] }> = {},
): string {
  return line({
    type: 'assistant',
    sessionId: 'test-session-id',
    slug: 'test-slug',
    timestamp: opts.timestamp ?? '2026-02-20T10:00:02.000Z',
    message: {
      role: 'assistant',
      content: [
        ...(opts.extraContent ?? []),
        { type: 'tool_use', name: toolName, input },
      ],
    },
  });
}

function progressLine(): string {
  return line({
    type: 'progress',
    sessionId: 'test-session-id',
    timestamp: '2026-02-20T08:59:00.000Z',
    data: { type: 'hook_progress' },
  });
}

function fileHistoryLine(): string {
  return line({
    type: 'file-history-snapshot',
    snapshot: { trackedFileBackups: {} },
  });
}

function toolResultLine(): string {
  return line({
    type: 'user',
    sessionId: 'test-session-id',
    timestamp: '2026-02-20T10:00:03.000Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_123', content: 'file content here...' }],
    },
  });
}

describe('TranscriptParser', () => {
  describe('Given a normal conversation with user and assistant turns', () => {
    let result: TranscriptSummary;

    const jsonl = [
      fileHistoryLine(),
      progressLine(),
      userTextLine('Hello, help me fix a bug', { timestamp: '2026-02-20T09:00:00.000Z' }),
      assistantTextLine('Sure, let me look at the code.', { timestamp: '2026-02-20T09:00:05.000Z' }),
      userTextLine('The error is in auth.ts', { timestamp: '2026-02-20T09:01:00.000Z' }),
      assistantTextLine('I found the issue. Let me fix it.', { timestamp: '2026-02-20T09:01:30.000Z' }),
    ].join('\n');

    it('When parsed, Then extracts correct session metadata', () => {
      result = parseTranscript(jsonl);
      expect(result.sessionId).toBe('test-session-id');
      expect(result.slug).toBe('test-slug');
    });

    it('When parsed, Then counts user turns correctly', () => {
      result = parseTranscript(jsonl);
      expect(result.turnCount).toBe(2);
    });

    it('When parsed, Then extracts all conversation turns', () => {
      result = parseTranscript(jsonl);
      expect(result.turns).toHaveLength(4);
      expect(result.turns[0]).toMatchObject({ role: 'user', text: 'Hello, help me fix a bug' });
      expect(result.turns[1]).toMatchObject({ role: 'assistant', text: 'Sure, let me look at the code.' });
      expect(result.turns[2]).toMatchObject({ role: 'user', text: 'The error is in auth.ts' });
      expect(result.turns[3]).toMatchObject({ role: 'assistant', text: 'I found the issue. Let me fix it.' });
    });

    it('When parsed, Then calculates timestamps from first to last entry', () => {
      result = parseTranscript(jsonl);
      expect(result.startedAt).toBeGreaterThan(0);
      expect(result.endedAt).toBeGreaterThan(0);
      // startedAt = progress line (08:59), endedAt = last assistant (09:01:30)
      expect(result.endedAt).toBeGreaterThanOrEqual(result.startedAt);
    });
  });

  describe('Given assistant messages with tool_use blocks', () => {
    it('When parsed, Then records tool names in turns and toolsUsed', () => {
      const jsonl = [
        userTextLine('Read the file'),
        assistantToolUseLine('Read', { file_path: '/src/index.ts' }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.toolsUsed).toContain('Read');
      const assistantTurn = result.turns.find((t) => t.role === 'assistant');
      expect(assistantTurn?.toolNames).toEqual(['Read']);
    });

    it('When Write/Edit tools are used, Then records filesModified', () => {
      const jsonl = [
        userTextLine('Fix the bug'),
        assistantToolUseLine('Edit', { file_path: '/src/auth.ts', old_string: 'foo', new_string: 'bar' }),
        assistantToolUseLine('Write', { file_path: '/src/new-file.ts' }),
        assistantToolUseLine('Read', { file_path: '/src/config.ts' }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.filesModified).toContain('/src/auth.ts');
      expect(result.filesModified).toContain('/src/new-file.ts');
      // Read 不算 file modification
      expect(result.filesModified).not.toContain('/src/config.ts');
    });

    it('When NotebookEdit is used, Then records notebook_path in filesModified', () => {
      const jsonl = [
        userTextLine('Edit the notebook'),
        assistantToolUseLine('NotebookEdit', { notebook_path: '/notebooks/analysis.ipynb' }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.filesModified).toContain('/notebooks/analysis.ipynb');
    });

    it('When tool_use has text alongside, Then captures both text and tool names', () => {
      const jsonl = [
        userTextLine('Fix it'),
        line({
          type: 'assistant',
          sessionId: 'test-session-id',
          slug: 'test-slug',
          timestamp: '2026-02-20T10:00:01.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me fix that.' },
              { type: 'tool_use', name: 'Edit', input: { file_path: '/src/fix.ts' } },
            ],
          },
        }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      const turn = result.turns.find((t) => t.role === 'assistant');
      expect(turn?.text).toBe('Let me fix that.');
      expect(turn?.toolNames).toEqual(['Edit']);
    });
  });

  describe('Given progress and file-history-snapshot lines', () => {
    it('When parsed, Then skips these lines and produces no turns from them', () => {
      const jsonl = [
        fileHistoryLine(),
        progressLine(),
        progressLine(),
        fileHistoryLine(),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.turns).toHaveLength(0);
      expect(result.turnCount).toBe(0);
    });
  });

  describe('Given tool_result messages from user', () => {
    it('When parsed, Then skips tool_result content (array content)', () => {
      const jsonl = [
        userTextLine('Read this file'),
        assistantToolUseLine('Read', { file_path: '/src/foo.ts' }),
        toolResultLine(),
        assistantTextLine('The file contains a function.'),
      ].join('\n');

      const result = parseTranscript(jsonl);
      // user 文字 + assistant tool_use + assistant text = 3 turns（tool_result 被跳過）
      expect(result.turns).toHaveLength(3);
      expect(result.turns.every((t) => t.role === 'user' || t.role === 'assistant')).toBe(true);
    });
  });

  describe('Given thinking blocks in assistant messages', () => {
    it('When parsed, Then ignores thinking content', () => {
      const jsonl = [
        userTextLine('Explain this'),
        line({
          type: 'assistant',
          sessionId: 'test-session-id',
          slug: 'test-slug',
          timestamp: '2026-02-20T10:00:01.000Z',
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Let me think about this deeply...' },
              { type: 'text', text: 'Here is the explanation.' },
            ],
          },
        }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      const turn = result.turns.find((t) => t.role === 'assistant');
      expect(turn?.text).toBe('Here is the explanation.');
      expect(turn?.text).not.toContain('think');
    });
  });

  describe('Given empty or malformed JSONL', () => {
    it('When content is empty, Then returns zero-state summary', () => {
      const result = parseTranscript('');
      expect(result.turnCount).toBe(0);
      expect(result.turns).toHaveLength(0);
      expect(result.sessionId).toBe('');
      expect(result.slug).toBe('');
    });

    it('When lines are invalid JSON, Then skips them gracefully', () => {
      const jsonl = [
        'not valid json',
        '{ broken',
        userTextLine('Valid message'),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.turnCount).toBe(1);
      expect(result.turns).toHaveLength(1);
    });

    it('When only progress lines exist, Then returns zero turns', () => {
      const jsonl = [progressLine(), progressLine()].join('\n');
      const result = parseTranscript(jsonl);
      expect(result.turnCount).toBe(0);
      expect(result.turns).toHaveLength(0);
      // sessionId should still be captured from progress lines
      expect(result.sessionId).toBe('test-session-id');
    });
  });

  describe('Given duplicate tool/file entries', () => {
    it('When same tool is used multiple times, Then toolsUsed is deduplicated', () => {
      const jsonl = [
        userTextLine('Do stuff'),
        assistantToolUseLine('Read', { file_path: '/a.ts' }),
        assistantToolUseLine('Read', { file_path: '/b.ts' }),
        assistantToolUseLine('Edit', { file_path: '/a.ts' }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.toolsUsed.filter((t) => t === 'Read')).toHaveLength(1);
      expect(result.toolsUsed.filter((t) => t === 'Edit')).toHaveLength(1);
    });

    it('When same file is modified multiple times, Then filesModified is deduplicated', () => {
      const jsonl = [
        userTextLine('Fix things'),
        assistantToolUseLine('Edit', { file_path: '/src/a.ts' }),
        assistantToolUseLine('Edit', { file_path: '/src/a.ts' }),
        assistantToolUseLine('Write', { file_path: '/src/a.ts' }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.filesModified.filter((f) => f === '/src/a.ts')).toHaveLength(1);
    });
  });

  describe('Given toolsUsed ordering', () => {
    it('When tools are used in arbitrary order, Then toolsUsed is sorted alphabetically', () => {
      const jsonl = [
        userTextLine('Work'),
        assistantToolUseLine('Write', { file_path: '/a.ts' }),
        assistantToolUseLine('Bash', { command: 'ls' }),
        assistantToolUseLine('Edit', { file_path: '/b.ts' }),
        assistantToolUseLine('Read', { file_path: '/c.ts' }),
      ].join('\n');

      const result = parseTranscript(jsonl);
      expect(result.toolsUsed).toEqual(['Bash', 'Edit', 'Read', 'Write']);
    });
  });
});
