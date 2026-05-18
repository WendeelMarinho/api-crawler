import type { NavigationTree, FlatNavItem } from '../types/navigation.js';
import type { SemanticDocument } from '../types/document.js';
import { slugify } from '../utils/slugify.js';

export interface HierarchyMapping {
  urlToNav: Map<string, FlatNavItem>;
  domainOrder: string[];
}

export function buildHierarchyMapping(flatNav: FlatNavItem[]): HierarchyMapping {
  const urlToNav = new Map<string, FlatNavItem>();
  const domainOrder: string[] = [];

  for (const item of flatNav) {
    if (item.url) {
      urlToNav.set(normalizeUrl(item.url), item);
    }
    if (item.depth === 0 && !domainOrder.includes(item.domain)) {
      domainOrder.push(item.domain);
    }
  }

  return { urlToNav, domainOrder };
}

export function assignDocumentsToHierarchy(
  documents: SemanticDocument[],
  mapping: HierarchyMapping,
): SemanticDocument[] {
  return documents.map((doc) => {
    const navItem = mapping.urlToNav.get(normalizeUrl(doc.url));
    if (!navItem) return doc;

    return {
      ...doc,
      domain: navItem.domain,
      subcategory: navItem.parentSlug ?? navItem.slug,
    };
  });
}

export function sortDocumentsByNav(
  documents: SemanticDocument[],
  domainOrder: string[],
): SemanticDocument[] {
  return [...documents].sort((a, b) => {
    const domainA = domainOrder.indexOf(a.domain);
    const domainB = domainOrder.indexOf(b.domain);
    if (domainA !== domainB) {
      return (domainA === -1 ? 999 : domainA) - (domainB === -1 ? 999 : domainB);
    }
    return a.title.localeCompare(b.title);
  });
}

export function treeToFolderStructure(tree: NavigationTree): Record<string, string[]> {
  const structure: Record<string, string[]> = {};

  for (const [domain, branch] of Object.entries(tree)) {
    structure[domain] = collectSlugs(branch.children);
    if (branch.url) {
      structure[domain].unshift(slugify(branch.title));
    }
  }

  return structure;
}

function collectSlugs(nodes: { title: string; children: { title: string; children: unknown[] }[] }[]): string[] {
  const slugs: string[] = [];
  for (const node of nodes) {
    slugs.push(slugify(node.title));
    slugs.push(...collectSlugs(node.children as typeof nodes));
  }
  return slugs;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url;
  }
}
