import type { FlatNavItem } from '../types/navigation.js';
import type { SemanticDocument } from '../types/document.js';
import { slugFromUrl, filenameFromUrlAndTitle } from '../utils/slugify.js';
import { urlHash } from '../utils/hash.js';

export interface StorageLocation {
  domain: string;
  segments: string[];
  filename: string;
  breadcrumbs: string[];
  subcategory: string;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '');
  }
}

export function buildNavUrlIndex(flatNav: FlatNavItem[]): Map<string, FlatNavItem> {
  const map = new Map<string, FlatNavItem>();
  for (const item of flatNav) {
    if (!item.url) continue;
    map.set(normalizeUrl(item.url), item);
  }
  return map;
}

export function pageSlugFromUrl(url: string, baseUrl: string): string {
  return slugFromUrl(url, baseUrl);
}

export function resolveStorageLocation(
  doc: Pick<SemanticDocument, 'url' | 'domain' | 'title' | 'endpoint' | 'type'>,
  navByUrl: Map<string, FlatNavItem>,
  baseUrl: string,
): StorageLocation {
  const nav = navByUrl.get(normalizeUrl(doc.url));
  const pageSlug = pageSlugFromUrl(doc.url, baseUrl);

  if (nav?.navPath && nav.navPath.length >= 1) {
    const domain = nav.navPath[0] ?? doc.domain;
    const leafSlug = nav.navPath[nav.navPath.length - 1] ?? pageSlug;
    const segments =
      nav.navPath.length > 2 ? nav.navPath.slice(1, -1) : nav.navPath.length === 2 ? [] : nav.navPath.slice(1);

    const breadcrumbs =
      nav.pathTitles && nav.pathTitles.length > 0
        ? nav.pathTitles
        : [domain, ...segments.map((s) => s.replace(/-/g, ' ')), doc.title].filter(Boolean);

    const subcategory = segments.length > 0 ? segments[segments.length - 1]! : leafSlug;

    return {
      domain,
      segments,
      filename: `${leafSlug}.json`,
      breadcrumbs,
      subcategory,
    };
  }

  const domain = doc.domain;
  const segments: string[] = [];
  const breadcrumbs = [domainTitleFromSlug(domain), doc.title].filter(Boolean);

  return {
    domain,
    segments,
    filename: `${pageSlug || urlHash(doc.url)}.json`,
    breadcrumbs,
    subcategory: pageSlug,
  };
}

function domainTitleFromSlug(slug: string): string {
  if (slug === 'start') return 'Start';
  return slug
    .replace(/^v1-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function buildFilenameForDocument(
  doc: Pick<SemanticDocument, 'url' | 'title' | 'endpoint' | 'type' | 'id'>,
  baseUrl: string,
): string {
  return filenameFromUrlAndTitle(
    doc.url,
    doc.title,
    baseUrl,
    doc.endpoint?.path,
    doc.endpoint?.method,
    doc.id,
  ).replace(/\.md$/, '.json');
}
