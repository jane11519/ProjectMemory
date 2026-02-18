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
