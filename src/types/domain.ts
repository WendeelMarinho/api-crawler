export interface DomainInfo {
  slug: string;
  title: string;
  description?: string;
  pageCount: number;
  endpointCount: number;
  subcategories: string[];
}

export interface DomainRegistry {
  domains: Record<string, DomainInfo>;
  updatedAt: string;
}

export type DocFramework =
  | 'readme'
  | 'docusaurus'
  | 'mintlify'
  | 'redoc'
  | 'swagger-ui'
  | 'stoplight'
  | 'gitbook'
  | 'unknown';

export interface CrawlState {
  visited: Set<string>;
  queued: Set<string>;
  failed: Map<string, string>;
  discovered: number;
  processed: number;
  skipped: number;
}

export interface CrawlPageResult {
  url: string;
  html: string;
  title: string;
  success: boolean;
  error?: string;
  screenshotPath?: string;
}
