import type { FlatNavItem } from '../types/navigation.js';
import type { SemanticDocument } from '../types/document.js';
import type { DomainInfo, DomainRegistry } from '../types/domain.js';
import {
  filenameFromUrlAndTitle,
  resolveDomainFromUrl,
  safeSlug,
  slugFromUrl,
} from '../utils/slugify.js';

export function resolveDomain(
  url: string,
  baseUrl: string,
  navItem?: FlatNavItem,
): { domain: string; subcategory: string } {
  if (navItem) {
    const segments =
      navItem.navPath && navItem.navPath.length > 2
        ? navItem.navPath.slice(1, -1)
        : navItem.parentSlug
          ? [navItem.parentSlug]
          : [];
    return {
      domain: navItem.domain,
      subcategory: segments.length > 0 ? segments[segments.length - 1]! : navItem.slug,
    };
  }

  const domain = resolveDomainFromUrl(url, baseUrl);
  const subcategory = safeSlug(slugFromUrl(url, baseUrl), 48);
  return { domain, subcategory };
}

export function buildDomainRegistry(documents: SemanticDocument[]): DomainRegistry {
  const domains: Record<string, DomainInfo> = {};

  for (const doc of documents) {
    if (!domains[doc.domain]) {
      domains[doc.domain] = {
        slug: doc.domain,
        title: formatDomainTitle(doc.domain),
        pageCount: 0,
        endpointCount: 0,
        subcategories: [],
      };
    }

    const info = domains[doc.domain];
    info.pageCount++;

    if (doc.type === 'endpoint') {
      info.endpointCount++;
    }

    if (doc.subcategory && !info.subcategories.includes(doc.subcategory)) {
      info.subcategories.push(doc.subcategory);
    }
  }

  return {
    domains,
    updatedAt: new Date().toISOString(),
  };
}

function formatDomainTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function filenameFromDocument(doc: SemanticDocument, baseUrl = 'https://developers.dock.tech'): string {
  return filenameFromUrlAndTitle(
    doc.url,
    doc.title,
    baseUrl,
    doc.endpoint?.path,
    doc.endpoint?.method,
    doc.id,
  );
}
