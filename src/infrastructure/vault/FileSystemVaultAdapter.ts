import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { VaultPort, FileInfo } from '../../domain/ports/VaultPort.js';

export class FileSystemVaultAdapter implements VaultPort {
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async listMarkdownFiles(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(dirPath, results);
    return results;
  }

  /** 遞迴走訪目錄，收集 .md 檔案（跳過隱藏目錄） */
  private async walkDir(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          await this.walkDir(fullPath, results);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  async getFileInfo(filePath: string): Promise<FileInfo> {
    const stat = await fs.stat(filePath);
    return { path: filePath, size: stat.size, mtimeMs: stat.mtimeMs };
  }

  async globDirectories(rootDir: string, pattern: string): Promise<string[]> {
    const results: string[] = [];
    const parts = pattern.split('/');
    if (parts.length === 2 && parts[1] === '*') {
      const parentDir = path.join(rootDir, parts[0]);
      if (fsSync.existsSync(parentDir)) {
        const entries = await fs.readdir(parentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            results.push(path.join(parts[0], entry.name));
          }
        }
      }
    }
    return results;
  }

  async readDirtyFiles(dirtyFilePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(dirtyFilePath, 'utf-8');
      return content.split('\n').map((l) => l.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async clearDirtyFiles(dirtyFilePath: string): Promise<void> {
    await fs.writeFile(dirtyFilePath, '', 'utf-8');
  }

  async appendDirtyFile(dirtyFilePath: string, filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(dirtyFilePath), { recursive: true });
    await fs.appendFile(dirtyFilePath, filePath + '\n', 'utf-8');
  }

  async ensureDirectory(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }
}
