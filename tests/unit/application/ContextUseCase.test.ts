import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextUseCase } from '../../../src/application/ContextUseCase.js';
import { DatabaseManager } from '../../../src/infrastructure/sqlite/DatabaseManager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Feature: 階層式 Context Metadata 管理
 *
 * 作為知識庫使用者，我需要為不同路徑設定 context metadata，
 * 使搜尋結果可以附帶相關的上下文資訊。
 * 子路徑自動繼承父路徑的 context。
 */
describe('ContextUseCase', () => {
  const tmpDir = path.join(os.tmpdir(), 'projmem-ctx-' + Date.now());
  let dbMgr: DatabaseManager;
  let useCase: ContextUseCase;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    dbMgr = new DatabaseManager(path.join(tmpDir, 'test.db'), 4);
    useCase = new ContextUseCase(dbMgr.getDb());
  });

  afterEach(() => {
    dbMgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Scenario: 新增 context
   * Given 一個虛擬路徑
   * When 呼叫 addContext
   * Then 回傳含 contextId 的 PathContext
   */
  it('should add a new context', () => {
    const ctx = useCase.addContext('code-notes/services/auth', 'Authentication service context');

    expect(ctx.contextId).toBeGreaterThan(0);
    expect(ctx.virtualPath).toBe('code-notes/services/auth');
    expect(ctx.description).toBe('Authentication service context');
  });

  /**
   * Scenario: 更新既有 context
   * Given 已存在的虛擬路徑
   * When 再次 addContext
   * Then 更新描述而非建立新的
   */
  it('should update existing context', () => {
    useCase.addContext('code-notes/services/auth', 'Old description');
    const updated = useCase.addContext('code-notes/services/auth', 'New description');

    expect(updated.description).toBe('New description');
    const all = useCase.listContexts();
    expect(all).toHaveLength(1);
  });

  /**
   * Scenario: 列出所有 contexts
   * Given 多個 context
   * When 呼叫 listContexts
   * Then 回傳按路徑排序的列表
   */
  it('should list all contexts sorted by path', () => {
    useCase.addContext('rules/security', 'Security rules');
    useCase.addContext('code-notes/api', 'API notes');
    useCase.addContext('code-notes/auth', 'Auth notes');

    const contexts = useCase.listContexts();

    expect(contexts).toHaveLength(3);
    expect(contexts[0].virtualPath).toBe('code-notes/api');
    expect(contexts[1].virtualPath).toBe('code-notes/auth');
    expect(contexts[2].virtualPath).toBe('rules/security');
  });

  /**
   * Scenario: 階層式 context 繼承
   * Given 父路徑和子路徑各有 context
   * When checkContext 子路徑
   * Then 回傳子路徑和所有祖先路徑的 context
   */
  it('should return hierarchical contexts including ancestors', () => {
    useCase.addContext('code-notes', 'Root code notes');
    useCase.addContext('code-notes/services', 'All services context');
    useCase.addContext('code-notes/services/auth', 'Auth service specific');

    const contexts = useCase.checkContext('code-notes/services/auth');

    expect(contexts).toHaveLength(3);
    // 最長路徑優先（最具體的 context）
    expect(contexts[0].virtualPath).toBe('code-notes/services/auth');
    expect(contexts[1].virtualPath).toBe('code-notes/services');
    expect(contexts[2].virtualPath).toBe('code-notes');
  });

  /**
   * Scenario: 部分祖先不存在
   * Given 只有 root 和 leaf context（中間層無）
   * When checkContext leaf 路徑
   * Then 只回傳存在的 context
   */
  it('should only return existing ancestor contexts', () => {
    useCase.addContext('code-notes', 'Root');
    // 不建立 code-notes/services

    const contexts = useCase.checkContext('code-notes/services/auth');

    expect(contexts).toHaveLength(1);
    expect(contexts[0].virtualPath).toBe('code-notes');
  });

  /**
   * Scenario: projmem:// protocol 路徑正規化
   * Given 帶 protocol prefix 的路徑
   * When addContext 和 checkContext
   * Then 自動移除 prefix 並正確運作
   */
  it('should normalize projmem:// protocol paths', () => {
    useCase.addContext('projmem://code-notes/auth', 'Auth context');

    const contexts = useCase.checkContext('projmem://code-notes/auth');

    expect(contexts).toHaveLength(1);
    expect(contexts[0].virtualPath).toBe('code-notes/auth');
  });

  /**
   * Scenario: 移除 context
   * Given 一個存在的 context
   * When 呼叫 removeContext
   * Then 回傳 true 且 context 被移除
   */
  it('should remove an existing context', () => {
    useCase.addContext('code-notes/test', 'Test context');

    const removed = useCase.removeContext('code-notes/test');

    expect(removed).toBe(true);
    expect(useCase.listContexts()).toHaveLength(0);
  });

  /**
   * Scenario: 移除不存在的 context
   * Given 不存在的虛擬路徑
   * When 呼叫 removeContext
   * Then 回傳 false
   */
  it('should return false when removing non-existent context', () => {
    const removed = useCase.removeContext('nonexistent/path');
    expect(removed).toBe(false);
  });

  /**
   * Scenario: getContextsForDocPath 回傳描述字串
   * Given doc path 有 applicable contexts
   * When 呼叫 getContextsForDocPath
   * Then 回傳 "path: description" 格式的字串陣列
   */
  it('should return context descriptions for doc path', () => {
    useCase.addContext('code-notes', 'Knowledge base');
    useCase.addContext('code-notes/auth', 'Auth module notes');

    const descriptions = useCase.getContextsForDocPath('code-notes/auth/jwt.md');

    // jwt.md 不完全匹配任何 context 的 virtualPath
    // 但 "code-notes/auth" 和 "code-notes" 是祖先
    // 注意：getContextsForDocPath 使用 checkContext，路徑分割為 code-notes/auth/jwt.md → code-notes/auth → code-notes
    expect(descriptions.length).toBeGreaterThanOrEqual(1);
    expect(descriptions.some((d) => d.includes('Knowledge base'))).toBe(true);
  });
});
