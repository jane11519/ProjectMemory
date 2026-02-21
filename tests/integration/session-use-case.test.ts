import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionUseCase } from '../../src/application/SessionUseCase.js';
import { VaultSessionAdapter } from '../../src/infrastructure/session/VaultSessionAdapter.js';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import type { SessionSnapshot } from '../../src/application/dto/SessionSnapshot.js';
import type { SessionSummary } from '../../src/domain/value-objects/SessionSummary.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SessionUseCase', () => {
  const dim = 4;
  const tmpDir = path.join(os.tmpdir(), 'projmem-session-' + Date.now());
  const vaultDir = path.join(tmpDir, 'vault');
  const sessionsDir = path.join(vaultDir, 'sessions');
  let dbMgr: DatabaseManager;
  let sessionAdapter: VaultSessionAdapter;
  let useCase: SessionUseCase;

  beforeEach(() => {
    fs.mkdirSync(path.join(vaultDir, '.projmem'), { recursive: true });

    dbMgr = new DatabaseManager(path.join(vaultDir, '.projmem', 'index.db'), dim);
    const vault = new FileSystemVaultAdapter();
    sessionAdapter = new VaultSessionAdapter(dbMgr.getDb(), vault);
    useCase = new SessionUseCase(sessionAdapter, sessionsDir, vaultDir);
  });

  afterEach(() => {
    dbMgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should save session to DB and write Markdown with YAML frontmatter', async () => {
    const snapshot: SessionSnapshot = {
      sessionId: 'abc-123',
      projectDir: '/home/user/project',
      turnCount: 5,
      rollingSummary: 'Implemented auth module with JWT.',
      decisions: ['Use bcrypt for hashing', 'Add rate limiter'],
      searchFootprint: ['authentication', 'JWT validation'],
      status: 'active',
    };

    await useCase.save(snapshot);

    // 驗證 DB 中的 session 已儲存
    const session = sessionAdapter.getSession('abc-123');
    expect(session).toBeDefined();
    expect(session!.sessionId).toBe('abc-123');
    expect(session!.projectDir).toBe('/home/user/project');
    expect(session!.turnCount).toBe(5);
    expect(session!.rollingSummary).toBe('Implemented auth module with JWT.');
    expect(session!.status).toBe('active');

    // 驗證 vault/sessions/ 下的 Markdown 檔案
    const files = fs.readdirSync(sessionsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('abc-123');
    expect(files[0]).toMatch(/\.md$/);

    // 驗證 YAML frontmatter
    const content = fs.readFileSync(path.join(sessionsDir, files[0]), 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('session_id: "abc-123"');
    expect(content).toContain("project_dir: '/home/user/project'");
    expect(content).toContain('## Rolling Summary');
    expect(content).toContain('Implemented auth module with JWT.');
    expect(content).toContain('## Decisions');
    expect(content).toContain('Use bcrypt for hashing');
    expect(content).toContain('## Search Footprint');
    expect(content).toContain('authentication');
  });

  it('should compact session: rolling_summary shortened, status updated', async () => {
    // 先保存一個有長 summary 的 session
    const longSummary = Array(50)
      .fill('This is a detailed sentence about the implementation progress.')
      .join(' ');

    const snapshot: SessionSnapshot = {
      sessionId: 'compact-001',
      projectDir: '/home/user/project',
      turnCount: 30,
      rollingSummary: longSummary,
      decisions: ['Decision A', 'Decision B', 'Decision C'],
      searchFootprint: ['query-1', 'query-2', 'query-3'],
      status: 'active',
    };

    await useCase.save(snapshot);

    // 執行 compact
    const result = await useCase.compact('compact-001');

    expect(result).toBeDefined();
    expect(result!.status).toBe('compacted');
    // compact 後 rolling_summary 應比原始短
    expect(result!.rollingSummary!.length).toBeLessThanOrEqual(longSummary.length);

    // DB 中的 session 也應已更新
    const dbSession = sessionAdapter.getSession('compact-001');
    expect(dbSession!.status).toBe('compacted');
    expect(dbSession!.rollingSummary!.length).toBeLessThanOrEqual(longSummary.length);
  });

  it('should return undefined when compacting non-existent session', async () => {
    const result = await useCase.compact('non-existent');
    expect(result).toBeUndefined();
  });

  it('should list active sessions', async () => {
    // 保存兩個 active session 和一個 compacted
    await useCase.save({
      sessionId: 'active-1',
      projectDir: '/proj',
      turnCount: 1,
      rollingSummary: 'First session',
      decisions: [],
      searchFootprint: [],
      status: 'active',
    });

    await useCase.save({
      sessionId: 'active-2',
      projectDir: '/proj',
      turnCount: 2,
      rollingSummary: 'Second session',
      decisions: [],
      searchFootprint: [],
      status: 'active',
    });

    await useCase.save({
      sessionId: 'closed-1',
      projectDir: '/proj',
      turnCount: 3,
      rollingSummary: 'Closed session',
      decisions: [],
      searchFootprint: [],
      status: 'closed',
    });

    const activeSessions = useCase.listActive();
    expect(activeSessions.length).toBe(2);
    expect(activeSessions.map((s) => s.sessionId)).toContain('active-1');
    expect(activeSessions.map((s) => s.sessionId)).toContain('active-2');
  });

  /**
   * Scenario: listSessions 帶 hasSummary 過濾
   * Given 一個有 summary 和一個無 summary 的 session
   * When 以 hasSummary: false 過濾
   * Then 只回傳無 summary 的 session
   */
  it('should list sessions with hasSummary filter', async () => {
    await useCase.save({
      sessionId: 'with-summary',
      projectDir: '/proj',
      turnCount: 5,
      rollingSummary: 'Has summary',
      decisions: [],
      searchFootprint: [],
      status: 'active',
    });

    // 為 with-summary 加上 summary
    await useCase.updateSummary('with-summary', {
      overview: 'Test session overview.',
      decisions: ['Decision A'],
      outcomes: ['Outcome 1'],
      openItems: [],
      tags: ['test'],
    });

    await useCase.save({
      sessionId: 'without-summary',
      projectDir: '/proj',
      turnCount: 3,
      rollingSummary: 'No summary',
      decisions: [],
      searchFootprint: [],
      status: 'active',
    });

    // 過濾無 summary
    const noSummary = useCase.listSessions({ hasSummary: false });
    expect(noSummary).toHaveLength(1);
    expect(noSummary[0].sessionId).toBe('without-summary');

    // 過濾有 summary
    const hasSummary = useCase.listSessions({ hasSummary: true });
    expect(hasSummary).toHaveLength(1);
    expect(hasSummary[0].sessionId).toBe('with-summary');
  });

  /**
   * Scenario: updateSummary 儲存結構化摘要並更新 Markdown
   * Given 一個已存在的 session
   * When 呼叫 updateSummary
   * Then DB 中的 summaryJson 應被更新
   * And vault Markdown 應包含 Summary 區塊
   */
  it('should update summary and write to Markdown', async () => {
    await useCase.save({
      sessionId: 'summary-test',
      projectDir: '/proj',
      turnCount: 8,
      rollingSummary: 'Working on auth.',
      decisions: ['Use JWT'],
      searchFootprint: ['auth'],
      status: 'active',
    });

    const summary: SessionSummary = {
      overview: 'Implemented JWT authentication with refresh token support.',
      decisions: ['Use RS256 signing', 'Store refresh tokens in DB'],
      outcomes: ['Created auth middleware', 'Added token refresh endpoint'],
      openItems: ['Add token revocation', 'Rate limit login attempts'],
      tags: ['auth', 'jwt', 'security'],
    };

    const result = await useCase.updateSummary('summary-test', summary);

    // 驗證 DB 更新
    expect(result).toBeDefined();
    expect(result!.summaryJson).toBeDefined();
    const parsed = JSON.parse(result!.summaryJson!);
    expect(parsed.overview).toBe(summary.overview);
    expect(parsed.decisions).toEqual(summary.decisions);
    expect(parsed.outcomes).toEqual(summary.outcomes);
    expect(parsed.openItems).toEqual(summary.openItems);
    expect(parsed.tags).toEqual(summary.tags);

    // 驗證 Markdown 包含 Summary 區塊
    const files = fs.readdirSync(sessionsDir);
    const mdFile = files.find((f) => f.includes('summary-test'));
    expect(mdFile).toBeDefined();

    const content = fs.readFileSync(path.join(sessionsDir, mdFile!), 'utf-8');
    expect(content).toContain('## Summary');
    expect(content).toContain('### Overview');
    expect(content).toContain('Implemented JWT authentication');
    expect(content).toContain('### Key Decisions');
    expect(content).toContain('Use RS256 signing');
    expect(content).toContain('### Outcomes');
    expect(content).toContain('Created auth middleware');
    expect(content).toContain('### Open Items');
    expect(content).toContain('Add token revocation');
    expect(content).toContain('### Tags');
    expect(content).toContain('`auth`');
    expect(content).toContain('`jwt`');
  });

  /**
   * Scenario: updateSummary 連續呼叫應合併摘要
   * Given 一個已有 summary 的 session
   * When 再次呼叫 updateSummary 帶有部分重複、部分新增的資料
   * Then overview 應以新值覆寫
   * And 陣列欄位應去重合併（保留既有 + 新增）
   */
  it('should merge summary on consecutive updateSummary calls', async () => {
    await useCase.save({
      sessionId: 'merge-test',
      projectDir: '/proj',
      turnCount: 5,
      rollingSummary: 'Working on merge.',
      decisions: [],
      searchFootprint: [],
      status: 'active',
    });

    // 第一次 updateSummary
    await useCase.updateSummary('merge-test', {
      overview: 'First overview.',
      decisions: ['Use JWT', 'Use bcrypt'],
      outcomes: ['Created auth module'],
      openItems: ['Add tests'],
      tags: ['auth', 'security'],
    });

    // 第二次 updateSummary：部分重複 + 部分新增
    const result = await useCase.updateSummary('merge-test', {
      overview: 'Updated overview with more detail.',
      decisions: ['Use bcrypt', 'Add rate limiter'],
      outcomes: ['Created auth module', 'Added login endpoint'],
      openItems: ['Add tests', 'Deploy to staging'],
      tags: ['security', 'api'],
    });

    expect(result).toBeDefined();
    const parsed = JSON.parse(result!.summaryJson!);

    // overview 應以新值覆寫
    expect(parsed.overview).toBe('Updated overview with more detail.');

    // 陣列欄位應去重合併
    expect(parsed.decisions).toEqual(expect.arrayContaining(['Use JWT', 'Use bcrypt', 'Add rate limiter']));
    expect(parsed.decisions).toHaveLength(3);

    expect(parsed.outcomes).toEqual(expect.arrayContaining(['Created auth module', 'Added login endpoint']));
    expect(parsed.outcomes).toHaveLength(2);

    expect(parsed.openItems).toEqual(expect.arrayContaining(['Add tests', 'Deploy to staging']));
    expect(parsed.openItems).toHaveLength(2);

    expect(parsed.tags).toEqual(expect.arrayContaining(['auth', 'security', 'api']));
    expect(parsed.tags).toHaveLength(3);
  });

  /**
   * Scenario: updateSummary 不存在的 session
   * Given 一個不存在的 session ID
   * When 呼叫 updateSummary
   * Then 回傳 undefined
   */
  it('should return undefined when updating summary of non-existent session', async () => {
    const result = await useCase.updateSummary('non-existent', {
      overview: 'test',
      decisions: [],
      outcomes: [],
      openItems: [],
      tags: [],
    });
    expect(result).toBeUndefined();
  });

  /**
   * Scenario: save 應保留既有的 summaryJson
   * Given 一個已有 summary 的 session
   * When 再次 save（如 capture 更新）
   * Then summaryJson 不應被覆蓋
   */
  it('should preserve existing summaryJson on re-save', async () => {
    await useCase.save({
      sessionId: 'preserve-test',
      projectDir: '/proj',
      turnCount: 5,
      rollingSummary: 'Initial',
      decisions: [],
      searchFootprint: [],
      status: 'active',
    });

    await useCase.updateSummary('preserve-test', {
      overview: 'Important summary.',
      decisions: [],
      outcomes: [],
      openItems: [],
      tags: ['important'],
    });

    // 再次 save（模擬 capture 更新）
    await useCase.save({
      sessionId: 'preserve-test',
      projectDir: '/proj',
      turnCount: 10,
      rollingSummary: 'Updated rolling summary',
      decisions: ['new decision'],
      searchFootprint: ['new search'],
      status: 'active',
    });

    const session = sessionAdapter.getSession('preserve-test');
    expect(session!.summaryJson).toBeDefined();
    const parsed = JSON.parse(session!.summaryJson!);
    expect(parsed.overview).toBe('Important summary.');
  });

  /**
   * Scenario: getTranscript 從 vault 讀取 JSONL
   * Given 一個 JSONL transcript 備份存在 vault/.projmem/transcripts/
   * When 呼叫 getTranscript
   * Then 回傳 parsed TranscriptSummary
   */
  it('should read transcript from vault backup', () => {
    const transcriptsDir = path.join(vaultDir, '.projmem', 'transcripts');
    fs.mkdirSync(transcriptsDir, { recursive: true });

    // 寫入模擬 JSONL
    const jsonl = [
      JSON.stringify({ type: 'user', sessionId: 'transcript-test', slug: 'test-slug', timestamp: '2024-01-01T00:00:00Z', message: { role: 'user', content: 'Hello' } }),
      JSON.stringify({ type: 'assistant', sessionId: 'transcript-test', timestamp: '2024-01-01T00:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] } }),
    ].join('\n');
    fs.writeFileSync(path.join(transcriptsDir, 'transcript-test.jsonl'), jsonl);

    const result = useCase.getTranscript('transcript-test');
    expect(result).toBeDefined();
    expect(result!.sessionId).toBe('transcript-test');
    expect(result!.turnCount).toBe(1); // 1 user turn
    expect(result!.turns).toHaveLength(2);
    expect(result!.turns[0].role).toBe('user');
    expect(result!.turns[0].text).toBe('Hello');
    expect(result!.turns[1].role).toBe('assistant');
    expect(result!.turns[1].text).toBe('Hi there!');
  });

  /**
   * Scenario: getTranscript 不存在的 transcript
   * Given transcript 備份不存在
   * When 呼叫 getTranscript
   * Then 回傳 undefined
   */
  it('should return undefined for missing transcript', () => {
    const result = useCase.getTranscript('non-existent');
    expect(result).toBeUndefined();
  });

  /**
   * Scenario: DB migration 新增 summary_json 欄位
   * Given 新建的 DB
   * When 檢查 sessions table columns
   * Then 應包含 summary_json 欄位
   */
  it('should have summary_json column in sessions table', () => {
    const columns = dbMgr.getDb().pragma('table_info(sessions)') as Array<{ name: string }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('summary_json');
  });
});
