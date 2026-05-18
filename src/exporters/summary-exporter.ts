import fs from 'fs-extra';
import type { SemanticDocument } from '../types/document.js';
import type { NavigationTree, FlatNavItem } from '../types/navigation.js';
import { STORAGE_PATHS } from '../config/constants.js';
import { buildDomainRegistry } from '../parsers/domain-parser.js';
import { logger } from '../utils/logger.js';

export interface CrawlSummary {
  completedAt: string;
  stats: {
    documents: number;
    domains: number;
    endpoints: number;
    navPages: number;
    visited: number;
    failed: number;
    interceptedApis: number;
  };
  domains: ReturnType<typeof buildDomainRegistry>;
  failedUrls?: Array<{ url: string; reason: string }>;
  outputPaths: typeof STORAGE_PATHS;
}

export class SummaryExporter {
  async export(params: {
    documents: SemanticDocument[];
    navTree: NavigationTree;
    flatNav: FlatNavItem[];
    visited: number;
    failed: number;
    interceptedApis: number;
    failedUrls?: Map<string, string>;
  }): Promise<string> {
    const domains = buildDomainRegistry(params.documents);
    const endpoints = params.documents.filter((d) => d.type === 'endpoint').length;

    const summary: CrawlSummary = {
      completedAt: new Date().toISOString(),
      stats: {
        documents: params.documents.length,
        domains: Object.keys(domains.domains).length,
        endpoints,
        navPages: params.flatNav.length,
        visited: params.visited,
        failed: params.failed,
        interceptedApis: params.interceptedApis,
      },
      domains,
      failedUrls: params.failedUrls
        ? [...params.failedUrls.entries()].map(([url, reason]) => ({ url, reason }))
        : undefined,
      outputPaths: STORAGE_PATHS,
    };

    const filepath = `${STORAGE_PATHS.navigation}/crawl-summary.json`;
    await fs.ensureDir(STORAGE_PATHS.navigation);
    await fs.writeJson(filepath, summary, { spaces: 2 });

    logger.info('Crawl summary exported', summary.stats);
    return filepath;
  }
}
