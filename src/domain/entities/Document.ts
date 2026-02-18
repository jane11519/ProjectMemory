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
