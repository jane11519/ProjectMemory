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
