import type { EndpointDefinition } from './endpoint.js';
import type { DocFramework } from './domain.js';
import type { ExtractionQuality } from './quality.js';

export type DocumentType =
  | 'concept'
  | 'endpoint'
  | 'schema'
  | 'guide'
  | 'overview'
  | 'reference'
  | 'changelog'
  | 'unknown';

export interface CodeBlock {
  language: string;
  code: string;
  label?: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface Heading {
  level: number;
  text: string;
  id?: string;
}

export interface SemanticDocument {
  id: string;
  title: string;
  domain: string;
  subcategory: string;
  /** Subfolders under storage/{json|markdown}/{domain}/ mirroring sidebar sections */
  storageSegments?: string[];
  type: DocumentType;
  url: string;
  content: string;
  markdown: string;
  description?: string;
  headings: Heading[];
  tables: TableData[];
  examples: CodeBlock[];
  codeBlocks: CodeBlock[];
  breadcrumbs: string[];
  tags: string[];
  endpoint?: EndpointDefinition;
  version?: string;
  authRequired?: boolean;
  contentHash: string;
  extractedAt: string;
  framework?: DocFramework;
  extractionQuality?: ExtractionQuality;
}

export interface SemanticChunk {
  id: string;
  domain: string;
  section: string;
  type: DocumentType;
  embedding_hint: string;
  content: string;
  metadata: Record<string, string | boolean | number>;
  sourceUrl: string;
  documentId: string;
}

export interface InterceptedApiCall {
  url: string;
  method: string;
  resourceType: 'openapi' | 'swagger' | 'graphql' | 'fetch' | 'xhr';
  headers: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  status?: number;
  timestamp: string;
}
