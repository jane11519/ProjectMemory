import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from './defaults.js';
import type { ProjMemConfig, PartialConfig } from './types.js';

export type { ProjMemConfig } from './types.js';

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

/** 環境變數覆蓋 config：OPENAI_BASE_URL → embedding.baseUrl & llm.baseUrl */
function applyEnvOverrides(config: ProjMemConfig): void {
  const baseUrl = process.env.OPENAI_BASE_URL;
  if (baseUrl) {
    config.embedding.baseUrl = baseUrl;
    config.llm.baseUrl = baseUrl;
  }
}

/** 驗證設定值的合法性 */
function validate(config: ProjMemConfig): void {
  if (!Number.isInteger(config.embedding.dimension) || config.embedding.dimension <= 0) {
    throw new Error('dimension must be a positive integer');
  }

  const weightSum = config.search.weights.lexical + config.search.weights.vector;
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error('weights must sum to 1.0');
  }
}

/**
 * 載入設定：讀取 .projmem.json（若存在）並合併到預設值上
 * @param repoRoot - repo 根目錄
 * @param overrides - 程式碼層級的覆蓋值（優先於檔案）
 */
export function loadConfig(
  repoRoot: string,
  overrides?: PartialConfig
): ProjMemConfig {
  let fileConfig: PartialConfig = {};

  const configPath = path.join(repoRoot, '.projmem.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as PartialConfig;
  }

  // 合併順序：defaults < file config < overrides
  let merged = deepMerge(DEFAULT_CONFIG, fileConfig as Partial<ProjMemConfig>);
  if (overrides) {
    merged = deepMerge(merged, overrides as Partial<ProjMemConfig>);
  }

  // 環境變數覆蓋（.mcp.json env 或系統環境變數）優先於檔案設定
  applyEnvOverrides(merged);

  validate(merged);
  return merged;
}
