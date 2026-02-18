import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionUseCase } from '../../src/application/SessionUseCase.js';
import { VaultSessionAdapter } from '../../src/infrastructure/session/VaultSessionAdapter.js';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import type { SessionSnapshot } from '../../src/application/dto/SessionSnapshot.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SessionUseCase', () => {
  const dim = 4;
  const tmpDir = path.join(os.tmpdir(), 'projecthub-session-' + Date.now());
  const vaultDir = path.join(tmpDir, 'vault');
  const sessionsDir = path.join(vaultDir, 'sessions');
  let dbMgr: DatabaseManager;
  let sessionAdapter: VaultSessionAdapter;
  let useCase: SessionUseCase;

  beforeEach(() => {
    fs.mkdirSync(path.join(vaultDir, '.projecthub'), { recursive: true });

    dbMgr = new DatabaseManager(path.join(vaultDir, '.projecthub', 'index.db'), dim);
    const vault = new FileSystemVaultAdapter();
    sessionAdapter = new VaultSessionAdapter(dbMgr.getDb(), vault);
    useCase = new SessionUseCase(sessionAdapter, sessionsDir);
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
    expect(content).toContain('project_dir: "/home/user/project"');
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
    expect(result!.rollingSummary!.length).toBeLessThan(longSummary.length);

    // DB 中的 session 也應已更新
    const dbSession = sessionAdapter.getSession('compact-001');
    expect(dbSession!.status).toBe('compacted');
    expect(dbSession!.rollingSummary!.length).toBeLessThan(longSummary.length);
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
});
