import type { Page } from 'playwright';
import { extractSidebar } from '../extractors/sidebar-extractor.js';
import type { NavigationTree, FlatNavItem } from '../types/navigation.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

export interface NavigationParseResult {
  tree: NavigationTree;
  flat: FlatNavItem[];
  html: string;
}

export async function parseNavigationFromPage(
  page: Page,
  baseUrl: string,
): Promise<NavigationParseResult> {
  await withRetry(
    async () => {
      await page.waitForSelector('nav, aside, [data-testid="sidebar"], .rm-Sidebar', {
        timeout: 30_000,
      });
    },
    { maxAttempts: 3, delayMs: 2000 },
  ).catch(() => {
    logger.warn('Sidebar selector not found — parsing available navigation');
  });

  const html = await page.content();
  const { tree, flat } = extractSidebar(html, baseUrl);

  logger.info(`Navigation parsed: ${Object.keys(tree).length} domains, ${flat.length} pages`);

  return { tree, flat, html };
}

export async function expandCollapsedSidebar(page: Page): Promise<void> {
  const expandSelectors = [
    '[aria-expanded="false"]',
    '[class*="collapsed"]',
    'button[class*="expand"]',
    '.rm-Sidebar button',
  ];

  for (const selector of expandSelectors) {
    const buttons = page.locator(selector);
    const count = await buttons.count().catch(() => 0);

    for (let i = 0; i < Math.min(count, 50); i++) {
      await buttons.nth(i).click({ timeout: 1000 }).catch(() => undefined);
    }
  }

  await page.waitForTimeout(500);
}
