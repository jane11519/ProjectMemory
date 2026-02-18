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
