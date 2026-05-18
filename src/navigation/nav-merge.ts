import type { FlatNavItem, NavigationNode, NavigationTree } from '../types/navigation.js';

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return url.replace(/\/$/, '');
  }
}

function mergeNodeChildren(
  existing: NavigationNode[],
  incoming: NavigationNode[],
): NavigationNode[] {
  const bySlug = new Map(existing.map((n) => [n.slug, n]));

  for (const node of incoming) {
    const prev = bySlug.get(node.slug);
    if (!prev) {
      bySlug.set(node.slug, node);
      continue;
    }
    bySlug.set(node.slug, {
      ...prev,
      url: prev.url ?? node.url,
      title: prev.title || node.title,
      children: mergeNodeChildren(prev.children, node.children),
    });
  }

  return [...bySlug.values()].sort((a, b) => a.order - b.order);
}

export function mergeNavigationTree(
  target: NavigationTree,
  incoming: NavigationTree,
): NavigationTree {
  for (const [key, branch] of Object.entries(incoming)) {
    if (!target[key]) {
      target[key] = branch;
      continue;
    }
    target[key] = {
      ...target[key],
      url: target[key].url ?? branch.url,
      title: target[key].title || branch.title,
      children: mergeNodeChildren(target[key].children, branch.children),
    };
  }
  return target;
}

export function mergeFlatNav(target: FlatNavItem[], incoming: FlatNavItem[]): FlatNavItem[] {
  const seen = new Set(target.map((n) => normalizeUrl(n.url)));
  for (const item of incoming) {
    const key = normalizeUrl(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
  return target;
}

export function wrapSidebarUnderDomain(
  domainSlug: string,
  domainTitle: string,
  domainUrl: string,
  sidebarTree: NavigationTree,
): NavigationTree {
  const children: NavigationNode[] = [];

  for (const branch of Object.values(sidebarTree)) {
    children.push({
      title: branch.title,
      slug: branch.slug,
      url: branch.url,
      depth: 1,
      order: children.length,
      children: branch.children,
    });
  }

  return {
    [domainSlug]: {
      title: domainTitle,
      slug: domainSlug,
      url: domainUrl,
      children,
    },
  };
}

export function domainTitleFromSlug(slug: string): string {
  if (slug === 'start') return 'Start';
  return slug
    .replace(/^v1-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function domainRootUrl(domainSlug: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  if (domainSlug === 'start') {
    return `${base}/reference/inicio`;
  }
  return `${base}/${domainSlug}/reference`;
}

export function isDomainReferenceRoot(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return /\/reference\/?$/i.test(pathname) || /\/reference\/inicio\/?$/i.test(pathname);
  } catch {
    return false;
  }
}

export function collectDomainSlugsFromDocs(urls: string[], baseUrl: string): string[] {
  const domains = new Set<string>();
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const base = new URL(baseUrl);
      let path = parsed.pathname;
      const basePath = base.pathname.replace(/\/$/, '');
      if (basePath && path.startsWith(basePath)) {
        path = path.slice(basePath.length);
      }
      const seg = path.split('/').filter(Boolean)[0];
      if (seg && (seg.startsWith('v1-') || ['banking', 'dock-one', 'pier', 'acquiring', 'start'].includes(seg))) {
        domains.add(seg === 'reference' ? 'start' : seg);
      }
    } catch {
      // skip
    }
  }
  const order = ['start', 'dock-one', 'banking', 'pier', 'acquiring', 'v1-dock-one', 'v1-banking', 'v1-pier', 'v1-acquiring'];
  return [...domains].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}
