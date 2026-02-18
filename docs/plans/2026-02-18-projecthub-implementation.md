# ProjectHub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a complete Claude Code project skill that manages project-level Obsidian knowledge bases with hybrid BM25+vector search, progressive disclosure, session persistence, and automatic hook-driven index updates.

**Architecture:** Hexagonal / Clean Architecture with 4 layers: Domain (entities, value objects, ports) → Application (use cases) → Infrastructure (SQLite adapters, vault filesystem, embedding providers) → CLI (Commander.js entry points + hook shell scripts). Domain has zero external dependencies; all I/O goes through port interfaces.

**Tech Stack:** TypeScript, Node.js 18+, better-sqlite3, sqlite-vec, gray-matter, Commander.js, OpenAI SDK, Vitest

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.projecthub.json`

**Step 1: Initialize package.json**

```json
{
  "name": "projecthub",
  "version": "0.1.0",
  "description": "Project-level Obsidian knowledge base with hybrid search for Claude Code",
  "type": "module",
  "engines": { "node": ">=18.0.0" },
  "bin": {
    "projecthub": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "sqlite-vec": "^0.1.7",
    "gray-matter": "^4.0.3",
    "commander": "^12.1.0",
    "openai": "^4.73.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@domain/*": ["./src/domain/*"],
      "@application/*": ["./src/application/*"],
      "@infrastructure/*": ["./src/infrastructure/*"],
      "@shared/*": ["./src/shared/*"],
      "@config/*": ["./src/config/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli/**'],
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@config': path.resolve(__dirname, 'src/config'),
    },
  },
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.js.map
*.d.ts
!src/**/*.d.ts
.projecthub/
vault/.projecthub/index.db
vault/.projecthub/dirty-files.txt
vault/.projecthub/audit.log
vault/.obsidian/workspace.json
vault/.obsidian/workspace-mobile.json
.env
*.log
coverage/
```

**Step 5: Create .projecthub.json (default config)**

```json
{
  "version": 1,
  "vault": {
    "root": "vault",
    "folders": ["code-notes", "rules", "integrations", "sessions", "structure"]
  },
  "index": {
    "dbPath": "vault/.projecthub/index.db",
    "dirtyFilePath": "vault/.projecthub/dirty-files.txt",
    "auditLogPath": "vault/.projecthub/audit.log"
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimension": 1536,
    "maxBatchSize": 100
  },
  "search": {
    "defaultTopK": 10,
    "candidateMultiplier": 5,
    "weights": {
      "lexical": 0.7,
      "vector": 0.3
    },
    "fts5FieldWeights": {
      "title": 8.0,
      "headingPath": 4.0,
      "body": 1.0,
      "tags": 2.0,
      "properties": 3.0
    }
  },
  "chunking": {
    "maxTokensPerChunk": 512,
    "overlapLines": 2
  },
  "session": {
    "autoSaveAfterTurns": 10,
    "compactTokenThreshold": 20000
  },
  "namespacePatterns": ["services/*", "packages/*", "apps/*", "libs/*", "modules/*"]
}
```

**Step 6: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors

**Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, that's fine)

**Step 8: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts .gitignore .projecthub.json
git commit -m "chore: scaffold ProjectHub project with TypeScript, Vitest, better-sqlite3"
```

---

## Task 2: Domain — Config Types

**Files:**
- Create: `src/config/types.ts`
- Create: `src/config/defaults.ts`
- Create: `src/config/ConfigLoader.ts`
- Test: `tests/unit/config/ConfigLoader.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/config/ConfigLoader.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig, type ProjectHubConfig } from '../../../src/config/ConfigLoader.js';

describe('ConfigLoader', () => {
  it('should return default config when no file exists', () => {
    const config = loadConfig('/nonexistent/path');
    expect(config.embedding.provider).toBe('openai');
    expect(config.embedding.dimension).toBe(1536);
    expect(config.search.weights.lexical).toBe(0.7);
    expect(config.search.weights.vector).toBe(0.3);
  });

  it('should merge partial config over defaults', () => {
    // 使用 fixture 路徑含 .projecthub.json
    const config = loadConfig('/nonexistent/path', {
      embedding: { provider: 'local', dimension: 384 },
    });
    expect(config.embedding.provider).toBe('local');
    expect(config.embedding.dimension).toBe(384);
    // 其他欄位仍用 defaults
    expect(config.search.weights.lexical).toBe(0.7);
  });

  it('should validate dimension is positive integer', () => {
    expect(() =>
      loadConfig('/nonexistent', { embedding: { dimension: -1 } })
    ).toThrow('dimension must be a positive integer');
  });

  it('should validate weights sum to 1.0', () => {
    expect(() =>
      loadConfig('/nonexistent', { search: { weights: { lexical: 0.5, vector: 0.3 } } })
    ).toThrow('weights must sum to 1.0');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config/ConfigLoader.test.ts`
Expected: FAIL — module not found

**Step 3: Write types.ts**

```typescript
// src/config/types.ts

/** Embedding 提供者設定 */
export interface EmbeddingConfig {
  provider: 'openai' | 'local';
  model: string;
  dimension: number;
  maxBatchSize: number;
  apiKey?: string;
  baseUrl?: string;
}

/** 搜尋權重設定 */
export interface SearchWeights {
  lexical: number;
  vector: number;
}

/** FTS5 欄位權重 */
export interface FTS5FieldWeights {
  title: number;
  headingPath: number;
  body: number;
  tags: number;
  properties: number;
}

/** 搜尋設定 */
export interface SearchConfig {
  defaultTopK: number;
  candidateMultiplier: number;
  weights: SearchWeights;
  fts5FieldWeights: FTS5FieldWeights;
}

/** Chunk 切分設定 */
export interface ChunkingConfig {
  maxTokensPerChunk: number;
  overlapLines: number;
}

/** Vault 設定 */
export interface VaultConfig {
  root: string;
  folders: string[];
}

/** 索引路徑設定 */
export interface IndexPathConfig {
  dbPath: string;
  dirtyFilePath: string;
  auditLogPath: string;
}

/** Session 設定 */
export interface SessionConfig {
  autoSaveAfterTurns: number;
  compactTokenThreshold: number;
}

/** 完整設定 */
export interface ProjectHubConfig {
  version: number;
  vault: VaultConfig;
  index: IndexPathConfig;
  embedding: EmbeddingConfig;
  search: SearchConfig;
  chunking: ChunkingConfig;
  session: SessionConfig;
  namespacePatterns: string[];
}

/** 部分設定（用於 merge） */
export type PartialConfig = {
  [K in keyof ProjectHubConfig]?: Partial<ProjectHubConfig[K]>;
};
```

**Step 4: Write defaults.ts**

```typescript
// src/config/defaults.ts
import type { ProjectHubConfig } from './types.js';

export const DEFAULT_CONFIG: ProjectHubConfig = {
  version: 1,
  vault: {
    root: 'vault',
    folders: ['code-notes', 'rules', 'integrations', 'sessions', 'structure'],
  },
  index: {
    dbPath: 'vault/.projecthub/index.db',
    dirtyFilePath: 'vault/.projecthub/dirty-files.txt',
    auditLogPath: 'vault/.projecthub/audit.log',
  },
  embedding: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimension: 1536,
    maxBatchSize: 100,
  },
  search: {
    defaultTopK: 10,
    candidateMultiplier: 5,
    weights: { lexical: 0.7, vector: 0.3 },
    fts5FieldWeights: {
      title: 8.0,
      headingPath: 4.0,
      body: 1.0,
      tags: 2.0,
      properties: 3.0,
    },
  },
  chunking: {
    maxTokensPerChunk: 512,
    overlapLines: 2,
  },
  session: {
    autoSaveAfterTurns: 10,
    compactTokenThreshold: 20000,
  },
  namespacePatterns: ['services/*', 'packages/*', 'apps/*', 'libs/*', 'modules/*'],
};
```

**Step 5: Write ConfigLoader.ts**

```typescript
// src/config/ConfigLoader.ts
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
  let merged = deepMerge(DEFAULT_CONFIG, fileConfig);
  if (overrides) {
    merged = deepMerge(merged, overrides as Partial<ProjectHubConfig>);
  }

  validate(merged);
  return merged;
}
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/config/ConfigLoader.test.ts`
Expected: 4 tests PASS

**Step 7: Commit**

```bash
git add src/config/ tests/unit/config/
git commit -m "feat: add config types, defaults, and ConfigLoader with validation"
```

---

## Task 3: Domain — Error Types

**Files:**
- Create: `src/domain/errors/DomainErrors.ts`
- Test: `tests/unit/domain/DomainErrors.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/domain/DomainErrors.test.ts
import { describe, it, expect } from 'vitest';
import {
  SqliteBusyError,
  EmbeddingRateLimitError,
  EmbeddingUnavailableError,
  VectorIndexCorruptError,
  FTSIndexCorruptError,
  ContentHashConflictError,
  SubmoduleNotInitializedError,
} from '../../../src/domain/errors/DomainErrors.js';

describe('DomainErrors', () => {
  it('SqliteBusyError is retryable', () => {
    const err = new SqliteBusyError('busy');
    expect(err.classification).toBe('retryable');
    expect(err.code).toBe('SQLITE_BUSY');
    expect(err.maxRetries).toBe(5);
    expect(err).toBeInstanceOf(Error);
  });

  it('EmbeddingRateLimitError is retryable', () => {
    const err = new EmbeddingRateLimitError('rate limit');
    expect(err.classification).toBe('retryable');
    expect(err.code).toBe('EMBEDDING_RATE_LIMIT');
  });

  it('EmbeddingUnavailableError is degradable', () => {
    const err = new EmbeddingUnavailableError('offline');
    expect(err.classification).toBe('degradable');
    expect(err.code).toBe('EMBEDDING_UNAVAILABLE');
  });

  it('VectorIndexCorruptError is degradable', () => {
    const err = new VectorIndexCorruptError('corrupt');
    expect(err.classification).toBe('degradable');
  });

  it('FTSIndexCorruptError is degradable', () => {
    const err = new FTSIndexCorruptError('corrupt');
    expect(err.classification).toBe('degradable');
  });

  it('ContentHashConflictError is manual', () => {
    const err = new ContentHashConflictError('conflict', 'abc', 'def');
    expect(err.classification).toBe('manual');
    expect(err.expectedHash).toBe('abc');
    expect(err.actualHash).toBe('def');
  });

  it('SubmoduleNotInitializedError is manual', () => {
    const err = new SubmoduleNotInitializedError('libs/shared');
    expect(err.classification).toBe('manual');
    expect(err.submodulePath).toBe('libs/shared');
    expect(err.message).toContain('libs/shared');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/domain/DomainErrors.test.ts`
Expected: FAIL — module not found

**Step 3: Write DomainErrors.ts**

```typescript
// src/domain/errors/DomainErrors.ts

export type ErrorClassification = 'retryable' | 'degradable' | 'manual';

/** 所有 ProjectHub domain 錯誤的基底類別 */
export abstract class ProjectHubError extends Error {
  abstract readonly classification: ErrorClassification;
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

// --- Retryable ---

export class SqliteBusyError extends ProjectHubError {
  readonly classification = 'retryable' as const;
  readonly code = 'SQLITE_BUSY';
  readonly maxRetries = 5;
  readonly baseDelayMs = 100;
}

export class EmbeddingRateLimitError extends ProjectHubError {
  readonly classification = 'retryable' as const;
  readonly code = 'EMBEDDING_RATE_LIMIT';
  readonly maxRetries = 3;
  readonly baseDelayMs = 1000;
}

export class FileTemporarilyUnavailableError extends ProjectHubError {
  readonly classification = 'retryable' as const;
  readonly code = 'FILE_TEMP_UNAVAILABLE';
  readonly maxRetries = 2;
  readonly baseDelayMs = 500;
}

// --- Degradable ---

export class EmbeddingUnavailableError extends ProjectHubError {
  readonly classification = 'degradable' as const;
  readonly code = 'EMBEDDING_UNAVAILABLE';
}

export class VectorIndexCorruptError extends ProjectHubError {
  readonly classification = 'degradable' as const;
  readonly code = 'VEC_INDEX_CORRUPT';
}

export class FTSIndexCorruptError extends ProjectHubError {
  readonly classification = 'degradable' as const;
  readonly code = 'FTS_INDEX_CORRUPT';
}

// --- Manual ---

export class ContentHashConflictError extends ProjectHubError {
  readonly classification = 'manual' as const;
  readonly code = 'HASH_CONFLICT';

  constructor(
    message: string,
    public readonly expectedHash: string,
    public readonly actualHash: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class SubmoduleNotInitializedError extends ProjectHubError {
  readonly classification = 'manual' as const;
  readonly code = 'SUBMODULE_NOT_INIT';

  constructor(
    public readonly submodulePath: string,
    options?: ErrorOptions,
  ) {
    super(
      `Submodule "${submodulePath}" is not initialized. Run: git submodule init ${submodulePath}`,
      options,
    );
  }
}

export class SchemaMigrationRequiredError extends ProjectHubError {
  readonly classification = 'manual' as const;
  readonly code = 'SCHEMA_MIGRATION';
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/domain/DomainErrors.test.ts`
Expected: 7 tests PASS

**Step 5: Commit**

```bash
git add src/domain/errors/ tests/unit/domain/
git commit -m "feat: add three-tier domain error types (retryable/degradable/manual)"
```

---

## Task 4: Domain — Value Objects (ContentHash, HybridScore)

**Files:**
- Create: `src/domain/value-objects/ContentHash.ts`
- Create: `src/domain/value-objects/HybridScore.ts`
- Test: `tests/unit/domain/ContentHash.test.ts`
- Test: `tests/unit/domain/HybridScore.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/unit/domain/ContentHash.test.ts
import { describe, it, expect } from 'vitest';
import { ContentHash } from '../../../src/domain/value-objects/ContentHash.js';

describe('ContentHash', () => {
  it('should produce consistent SHA-256 for same input', () => {
    const h1 = ContentHash.fromText('hello world');
    const h2 = ContentHash.fromText('hello world');
    expect(h1.value).toBe(h2.value);
    expect(h1.value).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('should produce different hash for different input', () => {
    const h1 = ContentHash.fromText('hello');
    const h2 = ContentHash.fromText('world');
    expect(h1.value).not.toBe(h2.value);
  });

  it('should equal another ContentHash with same value', () => {
    const h1 = ContentHash.fromText('test');
    const h2 = ContentHash.fromText('test');
    expect(h1.equals(h2)).toBe(true);
  });

  it('should create from existing hex string', () => {
    const h1 = ContentHash.fromText('test');
    const h2 = ContentHash.fromHex(h1.value);
    expect(h1.equals(h2)).toBe(true);
  });
});
```

```typescript
// tests/unit/domain/HybridScore.test.ts
import { describe, it, expect } from 'vitest';
import { HybridScore } from '../../../src/domain/value-objects/HybridScore.js';

describe('HybridScore', () => {
  it('should fuse lexical and vector scores with 70/30 weights', () => {
    const lexScores = new Map<number, number>([[1, 5.0], [2, 3.0]]);
    const vecScores = new Map<number, number>([[1, 0.8], [3, 0.9]]);

    const results = HybridScore.fuse(lexScores, vecScores, 0.7, 0.3);

    expect(results.length).toBeGreaterThan(0);
    // chunk 1 出現在兩路 → 應排最前
    expect(results[0].chunkId).toBe(1);
    // 結果降序排列
    for (let i = 1; i < results.length; i++) {
      expect(results[i].finalScore).toBeLessThanOrEqual(results[i - 1].finalScore);
    }
  });

  it('should handle empty lexical results (vector-only mode)', () => {
    const vecScores = new Map<number, number>([[1, 0.9], [2, 0.5]]);
    const results = HybridScore.fuse(null, vecScores, 0, 1.0);

    expect(results.length).toBe(2);
    expect(results[0].chunkId).toBe(1);
    expect(results[0].lexNorm).toBe(0);
  });

  it('should handle empty vector results (BM25-only mode)', () => {
    const lexScores = new Map<number, number>([[1, 10.0], [2, 5.0]]);
    const results = HybridScore.fuse(lexScores, null, 1.0, 0);

    expect(results.length).toBe(2);
    expect(results[0].chunkId).toBe(1);
    expect(results[0].vecNorm).toBe(0);
  });

  it('should return empty for no results', () => {
    const results = HybridScore.fuse(new Map(), new Map(), 0.7, 0.3);
    expect(results).toHaveLength(0);
  });

  it('should normalize scores per-query', () => {
    const lexScores = new Map<number, number>([[1, 100.0], [2, 50.0]]);
    const vecScores = new Map<number, number>([[1, 0.9], [2, 0.3]]);
    const results = HybridScore.fuse(lexScores, vecScores, 0.7, 0.3);

    // chunk 1: lexNorm = 100/100 = 1.0, vecNorm = 0.9/0.9 = 1.0
    expect(results[0].lexNorm).toBeCloseTo(1.0);
    expect(results[0].vecNorm).toBeCloseTo(1.0);
    // chunk 2: lexNorm = 50/100 = 0.5, vecNorm = 0.3/0.9 ≈ 0.333
    expect(results[1].lexNorm).toBeCloseTo(0.5);
    expect(results[1].vecNorm).toBeCloseTo(0.333, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/domain/ContentHash.test.ts tests/unit/domain/HybridScore.test.ts`
Expected: FAIL — modules not found

**Step 3: Write ContentHash.ts**

```typescript
// src/domain/value-objects/ContentHash.ts
import { createHash } from 'node:crypto';

/** 不可變的 SHA-256 內容雜湊值物件 */
export class ContentHash {
  private constructor(public readonly value: string) {}

  /** 從原始文字計算 SHA-256 */
  static fromText(text: string): ContentHash {
    const hash = createHash('sha256').update(text, 'utf-8').digest('hex');
    return new ContentHash(hash);
  }

  /** 從既有的 hex 字串建立（不重新計算） */
  static fromHex(hex: string): ContentHash {
    return new ContentHash(hex);
  }

  equals(other: ContentHash): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
```

**Step 4: Write HybridScore.ts**

```typescript
// src/domain/value-objects/HybridScore.ts

export interface RankedResult {
  chunkId: number;
  finalScore: number;
  lexNorm: number;
  vecNorm: number;
}

/**
 * 混合檢索分數融合
 * BM25（越大越好，已翻轉） + Vector similarity（越大越好）
 * Per-query max normalization → 加權線性融合
 */
export class HybridScore {
  static fuse(
    lexScores: Map<number, number> | null,
    vecScores: Map<number, number> | null,
    lexWeight: number,
    vecWeight: number,
  ): RankedResult[] {
    const lex = lexScores ?? new Map<number, number>();
    const vec = vecScores ?? new Map<number, number>();

    const allIds = new Set<number>([...lex.keys(), ...vec.keys()]);
    if (allIds.size === 0) return [];

    const maxLex = lex.size > 0 ? Math.max(...lex.values()) : 1;
    const maxVec = vec.size > 0 ? Math.max(...vec.values()) : 1;

    const ranked: RankedResult[] = [];
    for (const chunkId of allIds) {
      const lexRaw = lex.get(chunkId) ?? 0;
      const vecRaw = vec.get(chunkId) ?? 0;

      const lexNorm = maxLex > 0 ? lexRaw / maxLex : 0;
      const vecNorm = maxVec > 0 ? vecRaw / maxVec : 0;
      const finalScore = lexWeight * lexNorm + vecWeight * vecNorm;

      ranked.push({ chunkId, finalScore, lexNorm, vecNorm });
    }

    ranked.sort((a, b) => b.finalScore - a.finalScore);
    return ranked;
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/domain/ContentHash.test.ts tests/unit/domain/HybridScore.test.ts`
Expected: 9 tests PASS

**Step 6: Commit**

```bash
git add src/domain/value-objects/ tests/unit/domain/ContentHash.test.ts tests/unit/domain/HybridScore.test.ts
git commit -m "feat: add ContentHash and HybridScore value objects with per-query normalization"
```

---

## Task 5: Domain — Entities

**Files:**
- Create: `src/domain/entities/Namespace.ts`
- Create: `src/domain/entities/Document.ts`
- Create: `src/domain/entities/Chunk.ts`
- Create: `src/domain/entities/SearchResult.ts`
- Create: `src/domain/entities/Session.ts`

**Step 1: Write all entity files**

```typescript
// src/domain/entities/Namespace.ts
export type NamespaceKind = 'submodule' | 'directory' | 'root';

export interface Namespace {
  namespaceId?: number;
  name: string;
  kind: NamespaceKind;
  gitUrl?: string;
  gitCommit?: string;
  discoveredAt: number;
  lastScannedAt?: number;
}
```

```typescript
// src/domain/entities/Document.ts
export type SourceKind = 'code_note' | 'rule' | 'integration_doc' | 'dir_map' | 'session' | 'other';

export interface Document {
  docId?: number;
  namespaceId: number;
  docPath: string;
  refCodePath?: string;
  sourceKind: SourceKind;
  title: string;
  contentHash: string;
  fileSize: number;
  mtimeMs: number;
  frontmatterJson?: string;
  indexedAt: number;
}
```

```typescript
// src/domain/entities/Chunk.ts
export interface Chunk {
  chunkId?: number;
  docId: number;
  chunkIndex: number;
  headingPath: string;
  startLine: number;
  endLine: number;
  text: string;
  textHash: string;
  tokenEstimate?: number;
}
```

```typescript
// src/domain/entities/SearchResult.ts
export interface SearchResult {
  chunkId: number;
  docPath: string;
  title: string;
  headingPath: string;
  startLine: number;
  endLine: number;
  namespaceName: string;
  finalScore: number;
  lexNorm: number;
  vecNorm: number;
  snippet?: string;
  text?: string;
}
```

```typescript
// src/domain/entities/Session.ts
export type SessionStatus = 'active' | 'compacted' | 'closed';

export interface Session {
  sessionId: string;
  projectDir: string;
  startedAt: number;
  lastSavedAt: number;
  turnCount: number;
  rollingSummary?: string;
  decisionsJson?: string;
  searchFootprintJson?: string;
  status: SessionStatus;
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/entities/
git commit -m "feat: add domain entities (Namespace, Document, Chunk, SearchResult, Session)"
```

---

## Task 6: Domain — Ports (Interfaces)

**Files:**
- Create: `src/domain/ports/EmbeddingPort.ts`
- Create: `src/domain/ports/IndexPort.ts`
- Create: `src/domain/ports/VaultPort.ts`
- Create: `src/domain/ports/SessionPort.ts`

**Step 1: Write all port interfaces**

```typescript
// src/domain/ports/EmbeddingPort.ts
export interface EmbeddingResult {
  vector: Float32Array;
  tokensUsed: number;
}

export interface EmbeddingPort {
  readonly providerId: string;
  readonly dimension: number;
  readonly modelId: string;
  embed(texts: string[]): Promise<EmbeddingResult[]>;
  embedOne(text: string): Promise<EmbeddingResult>;
  isHealthy(): Promise<boolean>;
}
```

```typescript
// src/domain/ports/IndexPort.ts
import type { Document } from '../entities/Document.js';
import type { Chunk } from '../entities/Chunk.js';
import type { Namespace } from '../entities/Namespace.js';

export interface IndexPort {
  // Namespace 操作
  upsertNamespace(ns: Namespace): number;
  getNamespaceByName(name: string): Namespace | undefined;
  listNamespaces(): Namespace[];

  // Document 操作
  upsertDoc(doc: Document): number;
  getDocByPath(docPath: string): Document | undefined;
  listDocsByNamespace(namespaceId: number): Document[];
  deleteDoc(docId: number): void;

  // Chunk 操作
  insertChunks(chunks: Chunk[]): void;
  getChunksByDocId(docId: number): Chunk[];
  getChunkById(chunkId: number): Chunk | undefined;
  deleteChunksByDocId(docId: number): void;

  // FTS5 操作
  insertFTSRows(rows: Array<{ chunkId: number; title: string; headingPath: string; body: string; tags: string; properties: string }>): void;
  deleteFTSRows(chunkIds: number[]): void;
  searchBM25(query: string, topK: number, namespaceId?: number): Map<number, number>;

  // Vector 操作
  insertVecRows(rows: Array<{ chunkId: number; embedding: Float32Array }>): void;
  deleteVecRows(chunkIds: number[]): void;
  searchKNN(queryVec: Float32Array, topK: number): Map<number, number>;

  // 交易控制
  transaction<T>(fn: () => T): T;

  // 審計
  writeAuditLog(entry: { actor: string; action: string; targetPath?: string; detailJson?: string }): void;
}
```

```typescript
// src/domain/ports/VaultPort.ts
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
```

```typescript
// src/domain/ports/SessionPort.ts
import type { Session } from '../entities/Session.js';

export interface SessionPort {
  saveSession(session: Session): void;
  getSession(sessionId: string): Session | undefined;
  listActiveSessions(): Session[];
  updateSession(sessionId: string, updates: Partial<Session>): void;

  /** 寫出 session 的 Markdown 摘要到 vault */
  writeSessionMarkdown(session: Session, vaultSessionsDir: string): Promise<void>;
}
```

**Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/domain/ports/
git commit -m "feat: add domain port interfaces (Embedding, Index, Vault, Session)"
```

---

## Task 7: Shared Utilities (Logger, RetryPolicy)

**Files:**
- Create: `src/shared/Logger.ts`
- Create: `src/shared/RetryPolicy.ts`
- Test: `tests/unit/shared/RetryPolicy.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/shared/RetryPolicy.test.ts
import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../src/shared/RetryPolicy.js';

describe('RetryPolicy', () => {
  it('should succeed on first try', async () => {
    const fn = vi.fn().mockReturnValue('ok');
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      isRetryable: () => true,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error and succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockReturnValue('ok');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1, // 測試用最小延遲
      isRetryable: (err) => (err as Error).message === 'busy',
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('busy'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        isRetryable: () => true,
      })
    ).rejects.toThrow('busy');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        isRetryable: (err) => (err as Error).message === 'busy',
      })
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockReturnValue('ok');

    await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      isRetryable: () => true,
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/shared/RetryPolicy.test.ts`
Expected: FAIL — module not found

**Step 3: Write Logger.ts**

```typescript
// src/shared/Logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 結構化 JSON logger */
export class Logger {
  constructor(
    private readonly context: string,
    private readonly minLevel: LogLevel = 'info',
  ) {}

  private readonly levels: Record<LogLevel, number> = {
    debug: 0, info: 1, warn: 2, error: 3,
  };

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...data,
    };
    const output = JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stderr.write(output + '\n');
    }
  }

  debug(msg: string, data?: Record<string, unknown>) { this.log('debug', msg, data); }
  info(msg: string, data?: Record<string, unknown>) { this.log('info', msg, data); }
  warn(msg: string, data?: Record<string, unknown>) { this.log('warn', msg, data); }
  error(msg: string, data?: Record<string, unknown>) { this.log('error', msg, data); }
}
```

**Step 4: Write RetryPolicy.ts**

```typescript
// src/shared/RetryPolicy.ts

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  isRetryable: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

/**
 * 帶指數退避和 jitter 的重試策略
 * 總嘗試次數 = 1（初始） + maxRetries
 */
export async function withRetry<T>(
  operation: () => T | Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxRetries && opts.isRetryable(err)) {
        const delay = opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * opts.baseDelayMs;
        opts.onRetry?.(attempt + 1, err);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/shared/RetryPolicy.test.ts`
Expected: 5 tests PASS

**Step 6: Commit**

```bash
git add src/shared/ tests/unit/shared/
git commit -m "feat: add Logger and RetryPolicy with exponential backoff + jitter"
```

---

## Task 8: Infrastructure — DatabaseManager (SQLite + WAL + sqlite-vec)

**Files:**
- Create: `src/infrastructure/sqlite/schema.ts`
- Create: `src/infrastructure/sqlite/DatabaseManager.ts`
- Test: `tests/integration/sqlite-setup.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/integration/sqlite-setup.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('DatabaseManager', () => {
  const tmpDir = path.join(os.tmpdir(), 'projecthub-test-' + Date.now());
  const dbPath = path.join(tmpDir, 'test.db');

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create database with WAL mode and all tables', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const mgr = new DatabaseManager(dbPath);
    const db = mgr.getDb();

    // 確認 WAL 模式
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    // 確認所有表存在
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);

    expect(tables).toContain('namespaces');
    expect(tables).toContain('docs');
    expect(tables).toContain('chunks');
    expect(tables).toContain('audit_log');
    expect(tables).toContain('sessions');
    expect(tables).toContain('schema_meta');

    // 確認 FTS5 虛擬表
    const vtables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%fts5%'"
    ).all().map((r: any) => r.name);
    expect(vtables).toContain('chunks_fts');

    // 確認 sqlite-vec 虛擬表
    const vecTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%vec0%'"
    ).all().map((r: any) => r.name);
    expect(vecTables).toContain('chunks_vec');

    mgr.close();
  });

  it('should set busy_timeout', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    const mgr = new DatabaseManager(dbPath);
    const db = mgr.getDb();

    const timeout = db.pragma('busy_timeout', { simple: true });
    expect(Number(timeout)).toBeGreaterThanOrEqual(5000);

    mgr.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/sqlite-setup.test.ts`
Expected: FAIL — module not found

**Step 3: Write schema.ts**

```typescript
// src/infrastructure/sqlite/schema.ts

export const PRAGMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -64000;
`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS namespaces (
  namespace_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('submodule','directory','root')),
  git_url TEXT,
  git_commit TEXT,
  discovered_at INTEGER NOT NULL,
  last_scanned_at INTEGER
);

CREATE TABLE IF NOT EXISTS docs (
  doc_id INTEGER PRIMARY KEY,
  namespace_id INTEGER NOT NULL DEFAULT 1,
  doc_path TEXT NOT NULL UNIQUE,
  ref_code_path TEXT,
  source_kind TEXT NOT NULL DEFAULT 'code_note'
    CHECK(source_kind IN ('code_note','rule','integration_doc','dir_map','session','other')),
  title TEXT,
  content_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  frontmatter_json TEXT,
  indexed_at INTEGER NOT NULL,
  FOREIGN KEY(namespace_id) REFERENCES namespaces(namespace_id)
);

CREATE TABLE IF NOT EXISTS chunks (
  chunk_id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  heading_path TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  token_estimate INTEGER,
  FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  title,
  heading_path,
  body,
  tags,
  properties,
  content='',
  contentless_delete=1,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS audit_log (
  log_id INTEGER PRIMARY KEY,
  timestamp_ms INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_path TEXT,
  namespace_id INTEGER,
  detail_json TEXT,
  content_hash_before TEXT,
  content_hash_after TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_dir TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_saved_at INTEGER NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  rolling_summary TEXT,
  decisions_json TEXT,
  search_footprint_json TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','compacted','closed'))
);

CREATE INDEX IF NOT EXISTS idx_docs_namespace ON docs(namespace_id);
CREATE INDEX IF NOT EXISTS idx_docs_content_hash ON docs(content_hash);
CREATE INDEX IF NOT EXISTS idx_docs_source_kind ON docs(source_kind);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_text_hash ON chunks(text_hash);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_path);
`;

/**
 * sqlite-vec 的 vec0 虛擬表需要在 extension 載入後才能建立
 * dimension 由設定決定
 */
export function vecTableSQL(dimension: number): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(embedding float[${dimension}]);`;
}
```

**Step 4: Write DatabaseManager.ts**

```typescript
// src/infrastructure/sqlite/DatabaseManager.ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { PRAGMA_SQL, SCHEMA_SQL, vecTableSQL } from './schema.js';
import { Logger } from '../../shared/Logger.js';

export class DatabaseManager {
  private db: Database.Database;
  private logger: Logger;

  constructor(
    dbPath: string,
    private readonly embeddingDimension: number = 1536,
  ) {
    this.logger = new Logger('DatabaseManager');

    this.db = new Database(dbPath);

    // 載入 sqlite-vec extension
    this.db.loadExtension(sqliteVec.getLoadablePath());

    // 設定 PRAGMA（逐行執行，因為 PRAGMA 不支援批次）
    for (const line of PRAGMA_SQL.trim().split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        this.db.pragma(trimmed.replace('PRAGMA ', '').replace(';', ''));
      }
    }

    // 建立 schema
    this.db.exec(SCHEMA_SQL);
    this.db.exec(vecTableSQL(this.embeddingDimension));

    // 寫入 schema 版本
    this.db.prepare(
      "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', '1')"
    ).run();

    this.logger.info('Database initialized', { dbPath, embeddingDimension });
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/integration/sqlite-setup.test.ts`
Expected: 2 tests PASS

**Step 6: Commit**

```bash
git add src/infrastructure/sqlite/schema.ts src/infrastructure/sqlite/DatabaseManager.ts tests/integration/sqlite-setup.test.ts
git commit -m "feat: add DatabaseManager with WAL, sqlite-vec extension, and full schema"
```

---

## Task 9: Infrastructure — FTS5Adapter (BM25 Search)

**Files:**
- Create: `src/infrastructure/sqlite/FTS5Adapter.ts`
- Test: `tests/integration/fts5-adapter.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/integration/fts5-adapter.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { FTS5Adapter } from '../../src/infrastructure/sqlite/FTS5Adapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FTS5Adapter', () => {
  let mgr: DatabaseManager;
  let adapter: FTS5Adapter;
  const tmpDir = path.join(os.tmpdir(), 'projecthub-fts5-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    mgr = new DatabaseManager(path.join(tmpDir, 'test.db'));
    adapter = new FTS5Adapter(mgr.getDb());
  });

  afterEach(() => {
    mgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should insert and search FTS5 rows with BM25', () => {
    adapter.insertRows([
      { chunkId: 1, title: 'Authentication Service', headingPath: 'Auth / Login', body: 'Handles JWT token generation and validation', tags: 'auth,jwt', properties: 'status:active' },
      { chunkId: 2, title: 'User Profile', headingPath: 'User / Profile', body: 'User profile management and avatar upload', tags: 'user,profile', properties: 'status:active' },
      { chunkId: 3, title: 'Gateway Router', headingPath: 'Gateway', body: 'API gateway routing and rate limiting', tags: 'gateway,api', properties: 'status:draft' },
    ]);

    const results = adapter.searchBM25('JWT authentication', 10);
    expect(results.size).toBeGreaterThan(0);
    // chunk 1 提到 JWT 和 auth → 應出現在結果中
    expect(results.has(1)).toBe(true);
    // 結果值應是正數（翻轉後的 BM25）
    const score = results.get(1)!;
    expect(score).toBeGreaterThan(0);
  });

  it('should respect field weights (title > body)', () => {
    adapter.insertRows([
      { chunkId: 10, title: 'gateway', headingPath: '', body: 'unrelated text', tags: '', properties: '' },
      { chunkId: 11, title: 'unrelated', headingPath: '', body: 'gateway routing logic', tags: '', properties: '' },
    ]);

    const results = adapter.searchBM25('gateway', 10);
    // title 有更高權重 → chunk 10 分數應高於 chunk 11
    const score10 = results.get(10) ?? 0;
    const score11 = results.get(11) ?? 0;
    expect(score10).toBeGreaterThan(score11);
  });

  it('should delete FTS5 rows', () => {
    adapter.insertRows([
      { chunkId: 20, title: 'test', headingPath: '', body: 'deleteme content', tags: '', properties: '' },
    ]);
    expect(adapter.searchBM25('deleteme', 10).has(20)).toBe(true);

    adapter.deleteRows([20]);
    expect(adapter.searchBM25('deleteme', 10).has(20)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/fts5-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Write FTS5Adapter.ts**

```typescript
// src/infrastructure/sqlite/FTS5Adapter.ts
import type Database from 'better-sqlite3';

export interface FTSRow {
  chunkId: number;
  title: string;
  headingPath: string;
  body: string;
  tags: string;
  properties: string;
}

/**
 * FTS5 adapter：管理 contentless FTS5 表的 CRUD 與 BM25 查詢
 * field weights: title=8, heading_path=4, body=1, tags=2, properties=3
 */
export class FTS5Adapter {
  constructor(private readonly db: Database.Database) {}

  insertRows(rows: FTSRow[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO chunks_fts(rowid, title, heading_path, body, tags, properties) VALUES(?, ?, ?, ?, ?, ?)'
    );
    for (const row of rows) {
      stmt.run(row.chunkId, row.title, row.headingPath, row.body, row.tags, row.properties);
    }
  }

  deleteRows(chunkIds: number[]): void {
    const stmt = this.db.prepare(
      'DELETE FROM chunks_fts WHERE rowid = ?'
    );
    for (const id of chunkIds) {
      stmt.run(id);
    }
  }

  /**
   * BM25 搜尋，回傳 Map<chunkId, score>
   * score 已翻轉為「越大越好」（原始 bm25() 越小越好，這裡取負值）
   */
  searchBM25(query: string, topK: number, namespaceId?: number): Map<number, number> {
    // 先做基本查詢，namespace 篩選在上層做 JOIN
    const rows = this.db.prepare(`
      SELECT rowid AS chunk_id, bm25(chunks_fts, 8.0, 4.0, 1.0, 2.0, 3.0) AS bm25_score
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY bm25_score
      LIMIT ?
    `).all(query, topK) as Array<{ chunk_id: number; bm25_score: number }>;

    const result = new Map<number, number>();
    for (const row of rows) {
      result.set(row.chunk_id, -row.bm25_score); // 翻轉：越大越好
    }
    return result;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/fts5-adapter.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/infrastructure/sqlite/FTS5Adapter.ts tests/integration/fts5-adapter.test.ts
git commit -m "feat: add FTS5Adapter with BM25 search and field weights"
```

---

## Task 10: Infrastructure — SqliteVecAdapter (Vector KNN)

**Files:**
- Create: `src/infrastructure/sqlite/SqliteVecAdapter.ts`
- Test: `tests/integration/sqlite-vec-adapter.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/integration/sqlite-vec-adapter.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '../../src/infrastructure/sqlite/DatabaseManager.js';
import { SqliteVecAdapter } from '../../src/infrastructure/sqlite/SqliteVecAdapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SqliteVecAdapter', () => {
  let mgr: DatabaseManager;
  let adapter: SqliteVecAdapter;
  const dim = 4; // 測試用小維度
  const tmpDir = path.join(os.tmpdir(), 'projecthub-vec-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    mgr = new DatabaseManager(path.join(tmpDir, 'test.db'), dim);
    adapter = new SqliteVecAdapter(mgr.getDb());
  });

  afterEach(() => {
    mgr.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should insert and query vectors via KNN', () => {
    const v1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    const v2 = new Float32Array([0.0, 1.0, 0.0, 0.0]);
    const v3 = new Float32Array([0.9, 0.1, 0.0, 0.0]); // 最接近 v1

    adapter.insertRows([
      { chunkId: 1, embedding: v1 },
      { chunkId: 2, embedding: v2 },
      { chunkId: 3, embedding: v3 },
    ]);

    const queryVec = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    const results = adapter.searchKNN(queryVec, 3);

    expect(results.size).toBe(3);
    // chunk 1 完全匹配 → 相似度最高（距離最小）
    const sim1 = results.get(1)!;
    const sim2 = results.get(2)!;
    expect(sim1).toBeGreaterThan(sim2);
  });

  it('should delete vector rows', () => {
    const v1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
    adapter.insertRows([{ chunkId: 100, embedding: v1 }]);

    const before = adapter.searchKNN(v1, 10);
    expect(before.has(100)).toBe(true);

    adapter.deleteRows([100]);
    const after = adapter.searchKNN(v1, 10);
    expect(after.has(100)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/sqlite-vec-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Write SqliteVecAdapter.ts**

```typescript
// src/infrastructure/sqlite/SqliteVecAdapter.ts
import type Database from 'better-sqlite3';

export interface VecRow {
  chunkId: number;
  embedding: Float32Array;
}

/**
 * sqlite-vec adapter：管理 vec0 虛擬表的插入、刪除與 KNN 查詢
 * 回傳相似度（1 / (1 + distance)），越大越好
 */
export class SqliteVecAdapter {
  constructor(private readonly db: Database.Database) {}

  insertRows(rows: VecRow[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO chunks_vec(rowid, embedding) VALUES(?, ?)'
    );
    for (const row of rows) {
      stmt.run(row.chunkId, Buffer.from(row.embedding.buffer));
    }
  }

  deleteRows(chunkIds: number[]): void {
    const stmt = this.db.prepare('DELETE FROM chunks_vec WHERE rowid = ?');
    for (const id of chunkIds) {
      stmt.run(id);
    }
  }

  /**
   * KNN 查詢，回傳 Map<chunkId, similarity>
   * similarity = 1 / (1 + distance)，越大越好
   */
  searchKNN(queryVec: Float32Array, topK: number): Map<number, number> {
    const rows = this.db.prepare(`
      SELECT rowid AS chunk_id, distance
      FROM chunks_vec
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance
    `).all(Buffer.from(queryVec.buffer), topK) as Array<{ chunk_id: number; distance: number }>;

    const result = new Map<number, number>();
    for (const row of rows) {
      result.set(row.chunk_id, 1.0 / (1.0 + row.distance));
    }
    return result;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/sqlite-vec-adapter.test.ts`
Expected: 2 tests PASS

**Step 5: Commit**

```bash
git add src/infrastructure/sqlite/SqliteVecAdapter.ts tests/integration/sqlite-vec-adapter.test.ts
git commit -m "feat: add SqliteVecAdapter with KNN search and similarity scoring"
```

---

## Task 11: Infrastructure — MarkdownParser + ChunkingStrategy

**Files:**
- Create: `src/infrastructure/vault/MarkdownParser.ts`
- Create: `src/infrastructure/vault/ChunkingStrategy.ts`
- Test: `tests/unit/infrastructure/MarkdownParser.test.ts`
- Test: `tests/unit/infrastructure/ChunkingStrategy.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/unit/infrastructure/MarkdownParser.test.ts
import { describe, it, expect } from 'vitest';
import { MarkdownParser } from '../../../src/infrastructure/vault/MarkdownParser.js';

describe('MarkdownParser', () => {
  const parser = new MarkdownParser();

  it('should extract frontmatter and body', () => {
    const md = `---
title: Test Doc
tags: [auth, jwt]
namespace: services/auth
---

# Heading One

Body text here.`;

    const result = parser.parse(md);
    expect(result.frontmatter.title).toBe('Test Doc');
    expect(result.frontmatter.tags).toEqual(['auth', 'jwt']);
    expect(result.body).toContain('# Heading One');
    expect(result.body).toContain('Body text here.');
  });

  it('should handle markdown without frontmatter', () => {
    const md = '# Just a heading\n\nSome content.';
    const result = parser.parse(md);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toContain('# Just a heading');
  });

  it('should handle empty content', () => {
    const result = parser.parse('');
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('');
  });
});
```

```typescript
// tests/unit/infrastructure/ChunkingStrategy.test.ts
import { describe, it, expect } from 'vitest';
import { ChunkingStrategy, type RawChunk } from '../../../src/infrastructure/vault/ChunkingStrategy.js';

describe('ChunkingStrategy', () => {
  const strategy = new ChunkingStrategy();

  it('should chunk by headings', () => {
    const body = `# Introduction

This is the intro.

## Details

Detail content here.

## Conclusion

Final words.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(3);
    expect(chunks[0].headingPath).toBe('Introduction');
    expect(chunks[0].text).toContain('This is the intro.');
    expect(chunks[1].headingPath).toBe('Introduction / Details');
    expect(chunks[2].headingPath).toBe('Introduction / Conclusion');
  });

  it('should handle content before first heading', () => {
    const body = `Some preamble text.

# First Heading

Content.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(2);
    expect(chunks[0].headingPath).toBe('');
    expect(chunks[0].text).toContain('preamble');
  });

  it('should handle no headings', () => {
    const body = 'Just plain text with no headings at all.';
    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('plain text');
  });

  it('should handle empty body', () => {
    const chunks = strategy.chunkByHeadings('test.md', '');
    expect(chunks.length).toBe(0);
  });

  it('should not split on headings inside code blocks', () => {
    const body = `# Real Heading

Some code:

\`\`\`markdown
# This is not a heading
## Neither is this
\`\`\`

Still same section.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain('This is not a heading');
  });

  it('should track correct line numbers', () => {
    const body = `# First

Line 3.

# Second

Line 7.`;

    const chunks = strategy.chunkByHeadings('test.md', body);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[1].startLine).toBe(5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/infrastructure/MarkdownParser.test.ts tests/unit/infrastructure/ChunkingStrategy.test.ts`
Expected: FAIL — modules not found

**Step 3: Write MarkdownParser.ts**

```typescript
// src/infrastructure/vault/MarkdownParser.ts
import matter from 'gray-matter';

export interface ParsedMarkdown {
  frontmatter: Record<string, any>;
  body: string;
}

export class MarkdownParser {
  parse(rawMarkdown: string): ParsedMarkdown {
    if (!rawMarkdown.trim()) {
      return { frontmatter: {}, body: '' };
    }
    const { data, content } = matter(rawMarkdown);
    return {
      frontmatter: data ?? {},
      body: content ?? '',
    };
  }
}
```

**Step 4: Write ChunkingStrategy.ts**

```typescript
// src/infrastructure/vault/ChunkingStrategy.ts

const HEADING_RE = /^(#{1,6})\s+(.*)\s*$/;

export interface RawChunk {
  docPath: string;
  chunkIndex: number;
  headingPath: string;
  startLine: number;
  endLine: number;
  text: string;
}

/**
 * Heading-based chunking：以 Markdown heading 作為切分點
 * 會正確忽略 code block 內的 heading-like 行
 */
export class ChunkingStrategy {
  chunkByHeadings(docPath: string, body: string): RawChunk[] {
    if (!body.trim()) return [];

    const lines = body.split('\n');
    const headingStack: Array<{ level: number; title: string }> = [];
    const chunks: RawChunk[] = [];

    let segStart = 0;
    let segHeadingPath = '';
    let chunkIndex = 0;
    let inCodeBlock = false;

    const currentHeadingPath = (): string =>
      headingStack.map((h) => h.title).join(' / ');

    const flush = (segEnd: number): void => {
      const text = lines.slice(segStart, segEnd).join('\n').trim();
      if (text) {
        chunks.push({
          docPath,
          chunkIndex,
          headingPath: segHeadingPath,
          startLine: segStart + 1, // 1-based
          endLine: segEnd,
          text,
        });
        chunkIndex++;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 追蹤 code block 邊界
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const match = HEADING_RE.exec(line);
      if (match) {
        flush(i);

        const level = match[1].length;
        const title = match[2].trim();

        while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }
        headingStack.push({ level, title });

        segStart = i;
        segHeadingPath = currentHeadingPath();
      }
    }

    // 最後一段
    flush(lines.length);
    return chunks;
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/infrastructure/MarkdownParser.test.ts tests/unit/infrastructure/ChunkingStrategy.test.ts`
Expected: 9 tests PASS

**Step 6: Commit**

```bash
git add src/infrastructure/vault/MarkdownParser.ts src/infrastructure/vault/ChunkingStrategy.ts tests/unit/infrastructure/
git commit -m "feat: add MarkdownParser (gray-matter) and ChunkingStrategy (heading-based with code block awareness)"
```

---

## Task 12: Infrastructure — GitModulesParser

**Files:**
- Create: `src/infrastructure/vault/GitModulesParser.ts`
- Create: `tests/fixtures/sample-gitmodules`
- Test: `tests/unit/infrastructure/GitModulesParser.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/infrastructure/GitModulesParser.test.ts
import { describe, it, expect } from 'vitest';
import { GitModulesParser } from '../../../src/infrastructure/vault/GitModulesParser.js';

describe('GitModulesParser', () => {
  const parser = new GitModulesParser();

  it('should parse standard .gitmodules format', () => {
    const content = `[submodule "libs/shared"]
\tpath = libs/shared
\turl = https://github.com/org/shared.git

[submodule "services/auth"]
\tpath = services/auth
\turl = git@github.com:org/auth.git
\tbranch = main
`;

    const entries = parser.parse(content);
    expect(entries).toHaveLength(2);

    expect(entries[0].name).toBe('libs/shared');
    expect(entries[0].path).toBe('libs/shared');
    expect(entries[0].url).toBe('https://github.com/org/shared.git');
    expect(entries[0].branch).toBeUndefined();

    expect(entries[1].name).toBe('services/auth');
    expect(entries[1].path).toBe('services/auth');
    expect(entries[1].url).toBe('git@github.com:org/auth.git');
    expect(entries[1].branch).toBe('main');
  });

  it('should handle empty content', () => {
    expect(parser.parse('')).toHaveLength(0);
  });

  it('should handle spaces instead of tabs', () => {
    const content = `[submodule "foo"]
    path = foo
    url = https://example.com/foo.git
`;
    const entries = parser.parse(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('foo');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/infrastructure/GitModulesParser.test.ts`
Expected: FAIL — module not found

**Step 3: Write GitModulesParser.ts**

```typescript
// src/infrastructure/vault/GitModulesParser.ts

export interface SubmoduleEntry {
  name: string;
  path: string;
  url: string;
  branch?: string;
}

/**
 * 解析 .gitmodules INI 格式
 * 格式：
 *   [submodule "name"]
 *       path = value
 *       url = value
 *       branch = value (optional)
 */
export class GitModulesParser {
  parse(content: string): SubmoduleEntry[] {
    if (!content.trim()) return [];

    const entries: SubmoduleEntry[] = [];
    let current: Partial<SubmoduleEntry> | null = null;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();

      // 檢測 section header: [submodule "name"]
      const sectionMatch = /^\[submodule\s+"(.+)"\]$/.exec(line);
      if (sectionMatch) {
        if (current?.path && current?.url) {
          entries.push(current as SubmoduleEntry);
        }
        current = { name: sectionMatch[1] };
        continue;
      }

      if (!current) continue;

      // 解析 key = value
      const kvMatch = /^(\w+)\s*=\s*(.+)$/.exec(line);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        switch (key) {
          case 'path': current.path = value.trim(); break;
          case 'url': current.url = value.trim(); break;
          case 'branch': current.branch = value.trim(); break;
        }
      }
    }

    // 最後一個 entry
    if (current?.path && current?.url) {
      entries.push(current as SubmoduleEntry);
    }

    return entries;
  }
}
```

**Step 4: Create test fixture**

```
# tests/fixtures/sample-gitmodules
[submodule "libs/shared-utils"]
	path = libs/shared-utils
	url = https://github.com/org/shared-utils.git

[submodule "services/payment"]
	path = services/payment
	url = git@github.com:org/payment.git
	branch = develop
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/infrastructure/GitModulesParser.test.ts`
Expected: 3 tests PASS

**Step 6: Commit**

```bash
git add src/infrastructure/vault/GitModulesParser.ts tests/unit/infrastructure/GitModulesParser.test.ts tests/fixtures/sample-gitmodules
git commit -m "feat: add GitModulesParser for submodule namespace detection"
```

---

## Task 13: Infrastructure — FileSystemVaultAdapter

**Files:**
- Create: `src/infrastructure/vault/FileSystemVaultAdapter.ts`
- Create: `tests/fixtures/sample-vault/` (directory structure with sample files)
- Test: `tests/integration/vault-adapter.test.ts`

> **Note:** This task creates the concrete VaultPort implementation. Tests create temp directories with sample vault structure.

**Step 1: Write the failing test**

```typescript
// tests/integration/vault-adapter.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemVaultAdapter } from '../../src/infrastructure/vault/FileSystemVaultAdapter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FileSystemVaultAdapter', () => {
  let adapter: FileSystemVaultAdapter;
  const tmpDir = path.join(os.tmpdir(), 'projecthub-vault-' + Date.now());

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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/vault-adapter.test.ts`
Expected: FAIL — module not found

**Step 3: Write FileSystemVaultAdapter.ts**

```typescript
// src/infrastructure/vault/FileSystemVaultAdapter.ts
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { glob } from 'node:fs/promises';
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

  private async walkDir(dir: string, results: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 跳過隱藏目錄
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/vault-adapter.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/infrastructure/vault/FileSystemVaultAdapter.ts tests/integration/vault-adapter.test.ts
git commit -m "feat: add FileSystemVaultAdapter with markdown walking, dirty file management"
```

---

## Task 14: Infrastructure — OpenAI Embedding Adapter

**Files:**
- Create: `src/infrastructure/embedding/OpenAIEmbeddingAdapter.ts`
- Create: `src/infrastructure/embedding/EmbeddingBatcher.ts`
- Test: `tests/unit/infrastructure/EmbeddingBatcher.test.ts`

> **Note:** The OpenAI adapter uses a real API key and is tested via integration. The batcher is unit-testable with mocks.

**Step 1: Write the failing test for EmbeddingBatcher**

```typescript
// tests/unit/infrastructure/EmbeddingBatcher.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EmbeddingBatcher } from '../../../src/infrastructure/embedding/EmbeddingBatcher.js';
import type { EmbeddingPort, EmbeddingResult } from '../../../src/domain/ports/EmbeddingPort.js';

describe('EmbeddingBatcher', () => {
  const mockProvider: EmbeddingPort = {
    providerId: 'mock',
    dimension: 4,
    modelId: 'mock-model',
    embed: vi.fn(async (texts: string[]): Promise<EmbeddingResult[]> =>
      texts.map(() => ({ vector: new Float32Array([0.1, 0.2, 0.3, 0.4]), tokensUsed: 10 }))
    ),
    embedOne: vi.fn(async () => ({ vector: new Float32Array([0.1, 0.2, 0.3, 0.4]), tokensUsed: 10 })),
    isHealthy: vi.fn(async () => true),
  };

  it('should split into batches respecting maxBatchSize', async () => {
    const batcher = new EmbeddingBatcher(mockProvider, 2);
    const texts = ['a', 'b', 'c', 'd', 'e'];
    const results = await batcher.embedBatch(texts);

    expect(results).toHaveLength(5);
    // 5 texts / batch size 2 = 3 calls (2+2+1)
    expect(mockProvider.embed).toHaveBeenCalledTimes(3);
  });

  it('should handle empty input', async () => {
    const batcher = new EmbeddingBatcher(mockProvider, 10);
    const results = await batcher.embedBatch([]);
    expect(results).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/infrastructure/EmbeddingBatcher.test.ts`
Expected: FAIL — module not found

**Step 3: Write EmbeddingBatcher.ts**

```typescript
// src/infrastructure/embedding/EmbeddingBatcher.ts
import type { EmbeddingPort, EmbeddingResult } from '../../domain/ports/EmbeddingPort.js';

/**
 * 將大量文字拆成批次送入 EmbeddingPort
 * 處理 rate limiting 與批次大小限制
 */
export class EmbeddingBatcher {
  constructor(
    private readonly provider: EmbeddingPort,
    private readonly maxBatchSize: number = 100,
  ) {}

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const results: EmbeddingResult[] = [];
    for (let i = 0; i < texts.length; i += this.maxBatchSize) {
      const batch = texts.slice(i, i + this.maxBatchSize);
      const batchResults = await this.provider.embed(batch);
      results.push(...batchResults);
    }
    return results;
  }
}
```

**Step 4: Write OpenAIEmbeddingAdapter.ts**

```typescript
// src/infrastructure/embedding/OpenAIEmbeddingAdapter.ts
import OpenAI from 'openai';
import type { EmbeddingPort, EmbeddingResult } from '../../domain/ports/EmbeddingPort.js';
import { EmbeddingUnavailableError, EmbeddingRateLimitError } from '../../domain/errors/DomainErrors.js';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimension?: number;
  baseUrl?: string;
  maxRetries?: number;
}

export class OpenAIEmbeddingAdapter implements EmbeddingPort {
  readonly providerId = 'openai';
  readonly dimension: number;
  readonly modelId: string;
  private client: OpenAI;

  constructor(config: OpenAIEmbeddingConfig) {
    this.dimension = config.dimension ?? 1536;
    this.modelId = config.model ?? 'text-embedding-3-small';
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: config.maxRetries ?? 2,
    });
  }

  async embed(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    try {
      const response = await this.client.embeddings.create({
        model: this.modelId,
        input: texts,
        encoding_format: 'float',
      });

      return response.data.map((item) => ({
        vector: new Float32Array(item.embedding),
        tokensUsed: response.usage?.total_tokens ?? 0,
      }));
    } catch (err: any) {
      if (err?.status === 429) {
        throw new EmbeddingRateLimitError(`Rate limited by OpenAI`, { cause: err });
      }
      throw new EmbeddingUnavailableError(
        `OpenAI embedding failed: ${err?.message ?? 'unknown error'}`,
        { cause: err },
      );
    }
  }

  async embedOne(text: string): Promise<EmbeddingResult> {
    const [result] = await this.embed([text]);
    return result;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.embed(['health check']);
      return true;
    } catch {
      return false;
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/infrastructure/EmbeddingBatcher.test.ts`
Expected: 2 tests PASS

**Step 6: Commit**

```bash
git add src/infrastructure/embedding/ tests/unit/infrastructure/EmbeddingBatcher.test.ts
git commit -m "feat: add OpenAIEmbeddingAdapter and EmbeddingBatcher"
```

---

## Tasks 15-22: Application Use Cases, CLI, Session, Claude Code Integration

> **Note:** Tasks 15-22 follow the same TDD pattern. Due to the plan's length, the remaining tasks are described at module level. Each task follows the identical step structure: write failing test → verify fail → implement → verify pass → commit.

### Task 15: Application — ScanUseCase

**Files:** `src/application/ScanUseCase.ts`, `tests/integration/scan-use-case.test.ts`

**Key behavior:** Detect namespaces from `.gitmodules` (submodules) and directory patterns (monorepo). Scan vault for all Markdown files. Build catalog with content hashes. Warn about uninitialized submodules.

**Test scenarios:**
- Scan vault with 3 markdown files → catalog has 3 docs
- .gitmodules with 2 submodules (1 initialized, 1 not) → 1 namespace + 1 warning
- Monorepo with `services/auth/` and `services/api/` → 2 directory namespaces

### Task 16: Application — IndexUseCase (full build + incremental)

**Files:** `src/application/IndexUseCase.ts`, `src/application/dto/IndexStats.ts`, `tests/integration/index-use-case.test.ts`

**Key behavior:** Parse markdown → chunk → embed → upsert into all 3 tables (chunks, FTS5, vec0) in single transaction. Incremental mode reads dirty files and only re-indexes changed docs (compare content_hash). Delete removed files' chunks.

**Test scenarios:**
- Full build: 2 docs × 2 chunks each → 4 chunks + 4 FTS rows + 4 vec rows
- Incremental: modify 1 doc → only its chunks rebuilt
- Embedding failure → FTS5 still builds, vec0 empty, warning logged (degradable)

### Task 17: Application — SearchUseCase (hybrid search)

**Files:** `src/application/SearchUseCase.ts`, `src/application/dto/SearchRequest.ts`, `src/application/dto/SearchResponse.ts`, `tests/integration/hybrid-search.test.ts`

**Key behavior:** Run BM25 via FTS5Adapter + KNN via SqliteVecAdapter → fuse with HybridScore (0.7/0.3) → progressive disclosure formatting. Namespace filtering. Degradation to BM25-only or vec-only when one path fails.

**Test scenarios:**
- Exact keyword "JIRA-1234" → top result has lex_norm > vec_norm
- Namespace filter → only matching namespace chunks
- Vec index corrupt → fallback to BM25-only, searchMode="bm25_only"

### Task 18: Application — SessionUseCase

**Files:** `src/application/SessionUseCase.ts`, `src/application/dto/SessionSnapshot.ts`, `src/infrastructure/session/VaultSessionAdapter.ts`, `tests/integration/session-use-case.test.ts`

**Key behavior:** Save session state to SQLite + write Markdown summary to vault/sessions/. Compact: generate rolling summary preserving source references. Diff: compare current vs previous state.

**Test scenarios:**
- Save → creates `vault/sessions/<timestamp>_<session_id>.md` with YAML frontmatter
- Compact → rolling_summary updated, estimated_tokens decreases

### Task 19: Application — HealthCheckUseCase

**Files:** `src/application/HealthCheckUseCase.ts`, `tests/unit/application/HealthCheckUseCase.test.ts`

**Key behavior:** Verify FTS5 consistency (query known rows), vec0 health, detect orphaned chunks. With `--fix`: run FTS5 rebuild, clean orphans.

### Task 20: CLI — Commander.js Commands

**Files:** `src/cli/index.ts`, `src/cli/commands/{scan,build,update,search,session,health}.ts`, `src/cli/formatters/ProgressiveDisclosureFormatter.ts`

**Key behavior:** Wire all use cases to Commander.js commands. Format output as JSON or human-readable text. Handle errors with appropriate exit codes.

**Commands:**
```
projecthub scan [--repo-root] [--format json|text]
projecthub index build [--repo-root] [--embedding-provider]
projecthub index update [--repo-root] [--dirty-file]
projecthub search <query> [--top-k] [--namespace] [--level]
projecthub search expand <chunk_id>
projecthub search full <doc_path>
projecthub session save [--session-id]
projecthub session compact [--policy]
projecthub session diff [--since]
projecthub health [--fix]
```

### Task 21: Claude Code Integration — SKILL.md + Hooks

**Files:**
- `.claude/skills/projecthub/SKILL.md`
- `.claude/skills/projecthub/references/{search-algorithm,schema,vault-conventions,session-protocol,security}.md`
- `.claude/skills/projecthub/scripts/{track-dirty.sh,on-task-completed.sh,on-stop.sh,init-vault.sh}`
- `.claude/settings.json`

**SKILL.md:** < 1000 words body. Description triggers on: project knowledge, code explanations, search, session management. Lists all `/` commands. References point to detailed docs.

**Hooks:**
- `PostToolUse` (Write|Edit) → `track-dirty.sh` (sync, 5s) — append modified path to dirty-files.txt
- `TaskCompleted` → `on-task-completed.sh` (sync, 120s) — `node dist/cli/index.js index update && session save`
- `Stop` → `on-stop.sh` (async, 60s) — `node dist/cli/index.js session save`

### Task 22: Vault Initialization + .gitignore

**Files:** `.claude/skills/projecthub/scripts/init-vault.sh`

**Behavior:** Create vault directory structure, initialize SQLite database, write initial config.yaml.

---

## Verification Checklist

After all tasks are complete:

**1. Unit tests (domain ≥ 80% coverage):**
```bash
npx vitest run tests/unit --coverage
```

**2. Integration tests:**
```bash
npx vitest run tests/integration
```

**3. Build:**
```bash
npm run build
```

**4. E2E smoke test:**
```bash
# 初始化
bash .claude/skills/projecthub/scripts/init-vault.sh

# 放入測試 Markdown
cp tests/fixtures/sample-vault/code-notes/*.md vault/code-notes/

# 掃描
node dist/cli/index.js scan --repo-root . --format json

# 全量建索引（需要 OPENAI_API_KEY 或用 --embedding-provider local）
node dist/cli/index.js index build --repo-root . --format json

# 搜尋
node dist/cli/index.js search "authentication" --format json

# 展開結果
node dist/cli/index.js search expand <chunk_id_from_above> --format json

# Session save
node dist/cli/index.js session save --session-id test123

# Health check
node dist/cli/index.js health
```

**5. Hook test:**
- Manually edit a vault markdown → verify `dirty-files.txt` updated
- Simulate TaskCompleted → verify index updated + session saved

---

## Risk Notes

1. **sqlite-vec is pre-v1** — Pin version, wrap behind adapter, prepare for breaking changes
2. **FTS5 `contentless_delete=1`** requires SQLite 3.43.0+ — check better-sqlite3 bundled version; fallback to content-synced FTS5 if needed
3. **Windows path separators** — Always use `path.join()` and `path.relative()`, never hardcode `/`
4. **Embedding dimension mismatch** — If user switches from OpenAI (1536) to local (384), vec0 table must be recreated. Add migration support.
5. **Large vault performance** — For 10K+ files, batch embedding calls and monitor memory usage with Float32Array allocations
