import path from 'node:path';
import type { VaultPort } from '../domain/ports/VaultPort.js';
import type { GitModulesParser } from '../infrastructure/vault/GitModulesParser.js';
import type { Namespace, NamespaceKind } from '../domain/entities/Namespace.js';
import { ContentHash } from '../domain/value-objects/ContentHash.js';

/** 掃描輸入設定 */
export interface ScanOptions {
  vaultRoot: string;
  folders: string[];
  namespacePatterns: string[];
}

/** 掃描到的文件描述 */
export interface ScannedDoc {
  docPath: string;
  title: string;
  contentHash: string;
  fileSize: number;
  mtimeMs: number;
  frontmatter: Record<string, any>;
}

/** 掃描結果 */
export interface ScanResult {
  namespaces: Array<{ name: string; kind: NamespaceKind; gitUrl?: string }>;
  docs: ScannedDoc[];
  warnings: string[];
}

/**
 * 掃描 vault 與 repo，偵測 namespace 並建立文件目錄
 * - 從 .gitmodules 偵測 submodule namespace
 * - 從目錄模式偵測 monorepo namespace
 * - 掃描 vault 資料夾收集所有 Markdown 檔案
 */
export class ScanUseCase {
  constructor(
    private readonly vault: VaultPort,
    private readonly gitModulesParser: GitModulesParser,
  ) {}

  async scan(repoRoot: string, options: ScanOptions): Promise<ScanResult> {
    const namespaces: ScanResult['namespaces'] = [];
    const warnings: string[] = [];

    // 永遠包含 root namespace
    namespaces.push({ name: 'root', kind: 'root' });

    // 偵測 submodule namespaces
    await this.detectSubmodules(repoRoot, namespaces, warnings);

    // 偵測目錄 namespaces（monorepo 模式）
    await this.detectDirectoryNamespaces(repoRoot, options.namespacePatterns, namespaces);

    // 掃描 vault 中的 Markdown 檔案
    const docs = await this.scanVaultDocs(repoRoot, options.vaultRoot, options.folders);

    return { namespaces, docs, warnings };
  }

  /** 從 .gitmodules 偵測 submodule，檢查是否已初始化 */
  private async detectSubmodules(
    repoRoot: string,
    namespaces: ScanResult['namespaces'],
    warnings: string[],
  ): Promise<void> {
    const gitmodulesPath = path.join(repoRoot, '.gitmodules');
    if (!(await this.vault.fileExists(gitmodulesPath))) return;

    const content = await this.vault.readFile(gitmodulesPath);
    const entries = this.gitModulesParser.parse(content);

    for (const entry of entries) {
      const submoduleDir = path.join(repoRoot, entry.path);
      if (await this.vault.directoryExists(submoduleDir)) {
        namespaces.push({
          name: entry.path,
          kind: 'submodule',
          gitUrl: entry.url,
        });
      } else {
        warnings.push(
          `Submodule "${entry.path}" is not initialized. Run: git submodule init ${entry.path}`,
        );
      }
    }
  }

  /** 從目錄模式偵測 namespace（如 services/*, packages/*） */
  private async detectDirectoryNamespaces(
    repoRoot: string,
    patterns: string[],
    namespaces: ScanResult['namespaces'],
  ): Promise<void> {
    for (const pattern of patterns) {
      const dirs = await this.vault.globDirectories(repoRoot, pattern);
      for (const dir of dirs) {
        namespaces.push({ name: dir, kind: 'directory' });
      }
    }
  }

  /** 掃描 vault 中指定資料夾的所有 Markdown 檔案 */
  private async scanVaultDocs(
    repoRoot: string,
    vaultRoot: string,
    folders: string[],
  ): Promise<ScannedDoc[]> {
    const docs: ScannedDoc[] = [];
    const vaultAbsPath = path.join(repoRoot, vaultRoot);

    // 掃描每個指定資料夾
    for (const folder of folders) {
      const folderPath = path.join(vaultAbsPath, folder);
      if (!(await this.vault.directoryExists(folderPath))) continue;

      const mdFiles = await this.vault.listMarkdownFiles(folderPath);
      for (const filePath of mdFiles) {
        const content = await this.vault.readFile(filePath);
        const fileInfo = await this.vault.getFileInfo(filePath);

        // 簡易 frontmatter 解析（用 gray-matter 的格式）
        const { frontmatter, title } = this.extractMetadata(content, filePath);
        const contentHash = ContentHash.fromText(content);

        docs.push({
          docPath: path.relative(vaultAbsPath, filePath),
          title,
          contentHash: contentHash.value,
          fileSize: fileInfo.size,
          mtimeMs: fileInfo.mtimeMs,
          frontmatter,
        });
      }
    }

    return docs;
  }

  /** 從 Markdown 內容提取 metadata */
  private extractMetadata(
    content: string,
    filePath: string,
  ): { frontmatter: Record<string, any>; title: string } {
    // 簡易 frontmatter 解析
    let frontmatter: Record<string, any> = {};
    let body = content;

    if (content.startsWith('---')) {
      const endIdx = content.indexOf('---', 3);
      if (endIdx !== -1) {
        const fmBlock = content.slice(3, endIdx).trim();
        body = content.slice(endIdx + 3).trim();
        // 簡易 YAML key: value 解析
        for (const line of fmBlock.split('\n')) {
          const match = /^(\w+):\s*(.+)$/.exec(line.trim());
          if (match) {
            frontmatter[match[1]] = match[2];
          }
        }
      }
    }

    // title 優先用 frontmatter，否則用第一個 heading，再否則用檔名
    let title = frontmatter.title as string | undefined;
    if (!title) {
      const headingMatch = /^#\s+(.+)$/m.exec(body);
      if (headingMatch) {
        title = headingMatch[1].trim();
      }
    }
    if (!title) {
      title = path.basename(filePath, '.md');
    }

    return { frontmatter, title };
  }
}
