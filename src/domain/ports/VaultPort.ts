export interface FileInfo {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface VaultPort {
  fileExists(filePath: string): Promise<boolean>;
  directoryExists(dirPath: string): Promise<boolean>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  listMarkdownFiles(dirPath: string): Promise<string[]>;
  getFileInfo(filePath: string): Promise<FileInfo>;
  globDirectories(rootDir: string, pattern: string): Promise<string[]>;
  readDirtyFiles(dirtyFilePath: string): Promise<string[]>;
  clearDirtyFiles(dirtyFilePath: string): Promise<void>;
  appendDirtyFile(dirtyFilePath: string, filePath: string): Promise<void>;
  ensureDirectory(dirPath: string): Promise<void>;
}
