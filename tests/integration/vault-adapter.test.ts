import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FileSystemVaultAdapter', () => {
  let adapter: FileSystemVaultAdapter;
  const tmpDir = path.join(os.tmpdir(), 'projmem-vault-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'vault', 'code-notes'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'vault', 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'vault', 'code-notes', 'auth.md'), '---\ntitle: Auth\n---\n# Auth\nContent.');
    fs.writeFileSync(path.join(tmpDir, 'vault', 'code-notes', 'user.md'), '# User\nUser content.');
    fs.writeFileSync(path.join(tmpDir, 'vault', 'readme.txt'), 'not markdown');
    adapter = new FileSystemVaultAdapter();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should list only markdown files', async () => {
    const files = await adapter.listMarkdownFiles(path.join(tmpDir, 'vault'));
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.endsWith('.md'))).toBe(true);
  });

  it('should read file content', async () => {
    const content = await adapter.readFile(path.join(tmpDir, 'vault', 'code-notes', 'auth.md'));
    expect(content).toContain('# Auth');
  });

  it('should check file/directory existence', async () => {
    expect(await adapter.fileExists(path.join(tmpDir, 'vault', 'code-notes', 'auth.md'))).toBe(true);
    expect(await adapter.fileExists(path.join(tmpDir, 'vault', 'nope.md'))).toBe(false);
    expect(await adapter.directoryExists(path.join(tmpDir, 'vault', 'sessions'))).toBe(true);
  });

  it('should manage dirty files', async () => {
    const dirtyPath = path.join(tmpDir, 'dirty.txt');
    await adapter.appendDirtyFile(dirtyPath, '/path/to/a.md');
    await adapter.appendDirtyFile(dirtyPath, '/path/to/b.md');

    const dirty = await adapter.readDirtyFiles(dirtyPath);
    expect(dirty).toHaveLength(2);
    expect(dirty).toContain('/path/to/a.md');

    await adapter.clearDirtyFiles(dirtyPath);
    const cleared = await adapter.readDirtyFiles(dirtyPath);
    expect(cleared).toHaveLength(0);
  });
});
