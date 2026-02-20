import type { ProjMemConfig } from './types.js';

export const DEFAULT_CONFIG: ProjMemConfig = {
  version: 1,
  vault: {
    root: 'vault',
    folders: ['code-notes', 'rules', 'integrations', 'sessions', 'structure'],
  },
  index: {
    dbPath: 'vault/.projmem/index.db',
    dirtyFilePath: 'vault/.projmem/dirty-files.txt',
    auditLogPath: 'vault/.projmem/audit.log',
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
    fusionMethod: 'rrf',
    rrfK: 60,
    strongSignalMinScore: 0.85,
    strongSignalMinGap: 0.15,
    rerankCandidateLimit: 20,
    rerankBlending: {
      topRrfWeight: 0.75,
      midRrfWeight: 0.60,
      tailRrfWeight: 0.40,
    },
  },
  llm: {
    provider: 'none',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    cacheTTLMs: 3600000, // 1 小時
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
