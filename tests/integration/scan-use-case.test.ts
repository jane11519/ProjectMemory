import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScanUseCase, type ScanResult } from '../../src/application/ScanUseCase.js';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import { GitModulesParser } from '../../src/infrastructure/vault/GitModulesParser.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('ScanUseCase', () => {
  const tmpDir = path.join(os.tmpdir(), 'projmem-scan-' + Date.now());
  let useCase: ScanUseCase;

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'vault', 'code-notes'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'vault', 'rules'), { recursive: true });
    useCase = new ScanUseCase(
      new FileSystemVaultAdapter(),
      new GitModulesParser(),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should scan vault with 3 markdown files and produce 3 docs', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'code-notes', 'auth.md'),
      '---\ntitle: Auth Service\ntags: [auth]\n---\n# Auth\nHandles authentication.',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'code-notes', 'user.md'),
      '---\ntitle: User Service\n---\n# User\nUser management.',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'rules', 'coding-standards.md'),
      '# Coding Standards\nFollow SOLID principles.',
    );

    const result = await useCase.scan(tmpDir, {
      vaultRoot: 'vault',
      folders: ['code-notes', 'rules'],
      namespacePatterns: [],
    });

    expect(result.docs).toHaveLength(3);
    expect(result.docs.every((d) => d.contentHash.length === 64)).toBe(true);
    expect(result.namespaces).toContainEqual(
      expect.objectContaining({ name: 'root', kind: 'root' }),
    );
  });

  it('should detect submodules from .gitmodules (1 initialized, 1 not)', async () => {
    // 寫入 .gitmodules
    fs.writeFileSync(
      path.join(tmpDir, '.gitmodules'),
      `[submodule "libs/shared"]
\tpath = libs/shared
\turl = https://github.com/org/shared.git

[submodule "libs/missing"]
\tpath = libs/missing
\turl = https://github.com/org/missing.git
`,
    );
    // 只建立 libs/shared 目錄（libs/missing 不存在 → 未初始化警告）
    fs.mkdirSync(path.join(tmpDir, 'libs', 'shared'), { recursive: true });

    // 放一個 md 讓 vault 不為空
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'code-notes', 'test.md'),
      '# Test\nContent.',
    );

    const result = await useCase.scan(tmpDir, {
      vaultRoot: 'vault',
      folders: ['code-notes'],
      namespacePatterns: [],
    });

    // 應偵測到 1 個 submodule namespace
    const submoduleNs = result.namespaces.filter((n) => n.kind === 'submodule');
    expect(submoduleNs).toHaveLength(1);
    expect(submoduleNs[0].name).toBe('libs/shared');

    // 應有 1 個 warning（未初始化 submodule）
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('libs/missing');
  });

  it('should detect monorepo directory namespaces', async () => {
    // 建立 monorepo 結構
    fs.mkdirSync(path.join(tmpDir, 'services', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'services', 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'code-notes', 'test.md'),
      '# Test\nContent.',
    );

    const result = await useCase.scan(tmpDir, {
      vaultRoot: 'vault',
      folders: ['code-notes'],
      namespacePatterns: ['services/*'],
    });

    const dirNs = result.namespaces.filter((n) => n.kind === 'directory');
    expect(dirNs).toHaveLength(2);
    const names = dirNs.map((n) => n.name).sort();
    expect(names).toEqual(['services/api', 'services/auth']);
  });
});
