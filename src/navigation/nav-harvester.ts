import type { BrowserContext } from 'playwright';
import { extractSidebar } from '../extractors/sidebar-extractor.js';
import { expandCollapsedSidebar } from '../crawler/navigation-parser.js';
import type { FlatNavItem, NavigationTree } from '../types/navigation.js';
import {
  collectDomainSlugsFromDocs,
  domainRootUrl,
  domainTitleFromSlug,
  mergeFlatNav,
  mergeNavigationTree,
  wrapSidebarUnderDomain,
} from './nav-merge.js';
import { logger } from '../utils/logger.js';

export interface NavHarvestResult {
  tree: NavigationTree;
  flat: FlatNavItem[];
}

export async function harvestNavigationFromDomains(
  context: BrowserContext,
  options: {
    baseUrl: string;
    domainSlugs: string[];
    timeoutMs: number;
  },
): Promise<NavHarvestResult> {
  const tree: NavigationTree = {};
  let flat: FlatNavItem[] = [];

  for (const domainSlug of options.domainSlugs) {
    const rootUrl = domainRootUrl(domainSlug, options.baseUrl);
    const page = await context.newPage();

    try {
      logger.info(`Harvesting sidebar: ${domainSlug}`);
      await page.goto(rootUrl, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeoutMs,
      });
      await expandCollapsedSidebar(page);
      const html = await page.content();
      const { tree: sidebarTree, flat: sidebarFlat } = extractSidebar(html, options.baseUrl);

      const wrapped = wrapSidebarUnderDomain(
        domainSlug,
        domainTitleFromSlug(domainSlug),
        rootUrl,
        sidebarTree,
      );

      mergeNavigationTree(tree, wrapped);

      const reassignedFlat = sidebarFlat.map((item) => ({
        ...item,
        domain: domainSlug,
        navPath: [domainSlug, ...(item.navPath ?? [item.slug])],
        pathTitles: [domainTitleFromSlug(domainSlug), ...(item.pathTitles ?? [item.title])],
      }));

      flat = mergeFlatNav(flat, reassignedFlat);
      logger.info(`  ${domainSlug}: +${reassignedFlat.length} nav items`);
    } catch (error) {
      logger.warn(`Sidebar harvest failed for ${domainSlug}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }

  return { tree, flat };
}

export function discoverDomainsFromStoredUrls(urls: string[], baseUrl: string): string[] {
  return collectDomainSlugsFromDocs(urls, baseUrl);
}
