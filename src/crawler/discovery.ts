import fs from 'fs-extra';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { IGNORED_URL_PATTERNS, EXTERNAL_HOST_ALLOWLIST, STORAGE_PATHS } from '../config/constants.js';
import { extractPageLinks } from '../extractors/html-extractor.js';
import { urlHash } from '../utils/hash.js';
import type { DocFramework } from '../types/domain.js';
import type { FlatNavItem } from '../types/navigation.js';

export type CrawlDiscoverMode = 'sidebar' | 'full';

const NAV_LINK_SELECTORS = [
  '[data-testid="sidebar"] a[href]',
  '.rm-Sidebar a[href]',
  'nav.rm-Sidebar a[href]',
  'aside nav a[href]',
];

export function shouldCrawlUrl(url: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (parsed.hostname !== base.hostname) {
      return EXTERNAL_HOST_ALLOWLIST.includes(parsed.hostname);
    }

    for (const pattern of IGNORED_URL_PATTERNS) {
      if (pattern.test(url)) return false;
    }

    if (/\/(logout|signout|sign-out|login)(\?|$|\/)/i.test(parsed.pathname)) {
      return false;
    }

    if (parsed.hostname.includes('developers.dock.tech')) {
      const isDocPath =
        /^\/reference(\/|$)/i.test(parsed.pathname) ||
        /^\/v1-[^/]+\/reference(\/|$)/i.test(parsed.pathname);
      if (!isDocPath) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function discoverNavLinksFromHtml(
  html: string,
  pageUrl: string,
  baseUrl: string,
): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  const base = new URL(baseUrl);

  for (const selector of NAV_LINK_SELECTORS) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#')) return;
      try {
        const absolute = new URL(href, pageUrl);
        if (absolute.hostname === base.hostname) {
          absolute.hash = '';
          const normalized = absolute.href.replace(/\/$/, '');
          if (shouldCrawlUrl(normalized, baseUrl)) links.add(normalized);
        }
      } catch {
        // skip
      }
    });
  }

  return [...links];
}

export function discoverLinksFromHtml(
  html: string,
  pageUrl: string,
  baseUrl: string,
  framework?: DocFramework,
  mode: CrawlDiscoverMode = 'sidebar',
): string[] {
  if (mode === 'sidebar') {
    const navLinks = discoverNavLinksFromHtml(html, pageUrl, baseUrl);
    if (navLinks.length > 0) return navLinks;
  }

  const links = extractPageLinks(html, pageUrl, framework);
  return links.filter((link) => shouldCrawlUrl(link, baseUrl));
}

export function discoverLinksFromNav(
  flatNav: FlatNavItem[],
  baseUrl: string,
): string[] {
  return flatNav
    .map((item) => item.url)
    .filter((url): url is string => Boolean(url))
    .filter((url) => shouldCrawlUrl(url, baseUrl));
}

export function normalizeDiscoveryUrl(url: string, baseUrl: string): string {
  try {
    const absolute = new URL(url, baseUrl);
    absolute.hash = '';
    return absolute.href.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** URLs in navigation-flat.json that have no matching raw-html cache file. */
export async function discoverUncrawledNavUrls(
  flatNav: FlatNavItem[],
  baseUrl: string,
): Promise<string[]> {
  const crawledIds = new Set<string>();

  if (await fs.pathExists(STORAGE_PATHS.rawHtml)) {
    async function walkRaw(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkRaw(abs);
        } else if (entry.name.endsWith('.html')) {
          crawledIds.add(entry.name.replace(/\.html$/, ''));
        }
      }
    }
    await walkRaw(STORAGE_PATHS.rawHtml);
  }

  const missing: string[] = [];
  for (const item of flatNav) {
    if (!item.url) continue;
    const normalized = normalizeDiscoveryUrl(item.url, baseUrl);
    if (!shouldCrawlUrl(normalized, baseUrl)) continue;
    const id = urlHash(normalized);
    if (!crawledIds.has(id)) {
      missing.push(normalized);
    }
  }

  return [...new Set(missing)];
}
