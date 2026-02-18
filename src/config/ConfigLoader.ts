import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from './defaults.js';
import type { ProjectHubConfig, PartialConfig } from './types.js';

export type { ProjectHubConfig } from './types.js';

/** 深層合併：partial 覆蓋 base */
function deepMerge<T extends Record<string, any>>(base: T, partial: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(partial) as (keyof T)[]) {
    const val = partial[key];
    if (val !== undefined && typeof val === 'object' && !Array.isArray(val) && val !== null) {
      result[key] = deepMerge(result[key] as any, val as any);
    } else if (val !== undefined) {
      result[key] = val as T[keyof T];
    }
  }
  return result;
}

/** 驗證設定值的合法性 */
function validate(config: ProjectHubConfig): void {
  if (!Number.isInteger(config.embedding.dimension) || config.embedding.dimension <= 0) {
    throw new Error('dimension must be a positive integer');
  }

  const weightSum = config.search.weights.lexical + config.search.weights.vector;
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error('weights must sum to 1.0');
  }
}

/**
 * 載入設定：讀取 .projecthub.json（若存在）並合併到預設值上
 * @param repoRoot - repo 根目錄
 * @param overrides - 程式碼層級的覆蓋值（優先於檔案）
 */
export function loadConfig(
  repoRoot: string,
  overrides?: PartialConfig
): ProjectHubConfig {
  let fileConfig: PartialConfig = {};

  const configPath = path.join(repoRoot, '.projecthub.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as PartialConfig;
  }

  // 合併順序：defaults < file config < overrides
  let merged = deepMerge(DEFAULT_CONFIG, fileConfig as Partial<ProjectHubConfig>);
  if (overrides) {
    merged = deepMerge(merged, overrides as Partial<ProjectHubConfig>);
  }

  validate(merged);
  return merged;
}
