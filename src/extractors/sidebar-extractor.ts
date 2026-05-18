import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { FrameworkSelectors } from '../config/selectors.js';
import { FRAMEWORK_SELECTORS } from '../config/selectors.js';
import { detectFramework } from './html-extractor.js';
import type { DocFramework } from '../types/domain.js';
import type { FlatNavItem, NavigationNode, NavigationTree } from '../types/navigation.js';
import { slugify } from '../utils/slugify.js';
import { normalizeWhitespace } from '../utils/cleaner.js';

interface RawNavItem {
  title: string;
  url?: string;
  depth: number;
  order: number;
  children: RawNavItem[];
}

export function extractSidebar(
  html: string,
  baseUrl: string,
  framework?: DocFramework,
): { tree: NavigationTree; flat: FlatNavItem[] } {
  const $ = cheerio.load(html);
  const fw = framework ?? detectFramework(html);
  const selectors: FrameworkSelectors = FRAMEWORK_SELECTORS[fw];

  let sidebarEl: cheerio.Cheerio<AnyNode> | null = null;
  for (const selector of selectors.sidebar) {
    const found = $(selector).first();
    if (found.length > 0) {
      sidebarEl = found;
      break;
    }
  }

  if (!sidebarEl || sidebarEl.length === 0) {
    sidebarEl = $('nav').first();
  }

  const roots = parseSidebarList($, sidebarEl, baseUrl, 0);
  const tree = buildNavigationTree(roots);
  const flat = flattenNavigation(tree, baseUrl);

  return { tree, flat };
}

function parseSidebarList(
  $: cheerio.CheerioAPI,
  container: cheerio.Cheerio<AnyNode>,
  baseUrl: string,
  depth: number,
): RawNavItem[] {
  const items: RawNavItem[] = [];
  let order = 0;

  const listItems = container.children('ul, ol').length > 0
    ? container.children('ul, ol').children('li')
    : container.children('li');

  if (listItems.length === 0) {
    container.find('> li, [class*="item"], [class*="Item"]').each((idx, li) => {
      const item = parseNavItem($, $(li), baseUrl, depth, idx);
      if (item) items.push(item);
    });
    return items;
  }

  listItems.each((_idx, li) => {
    const item = parseNavItem($, $(li), baseUrl, depth, order++);
    if (item) items.push(item);
  });

  if (items.length === 0) {
    container.find('a[href]').each((_idx, anchor) => {
      const $a = $(anchor);
      const title = normalizeWhitespace($a.text());
      const href = $a.attr('href');
      if (!title || title.length < 2) return;

      let url: string | undefined;
      if (href && !href.startsWith('#')) {
        try {
          url = new URL(href, baseUrl).href;
        } catch {
          // skip
        }
      }

      const parentLi = $a.closest('li');
      const nestedUl = parentLi.find('> ul, > ol').first();
      const children =
        nestedUl.length > 0
          ? parseSidebarList($, nestedUl, baseUrl, depth + 1)
          : [];

      items.push({
        title,
        url,
        depth,
        order: _idx,
        children,
      });
    });
  }

  return items;
}

function parseNavItem(
  $: cheerio.CheerioAPI,
  li: cheerio.Cheerio<AnyNode>,
  baseUrl: string,
  depth: number,
  order: number,
): RawNavItem | null {
  const link = li.find('> a, > div a, [class*="link"] a').first();
  const title = normalizeWhitespace(
    link.text() || li.find('[class*="title"], [class*="label"]').first().text() || li.text(),
  );

  if (!title || title.length < 2) return null;

  let url: string | undefined;
  const href = link.attr('href');
  if (href && !href.startsWith('#')) {
    try {
      url = new URL(href, baseUrl).href;
    } catch {
      // skip
    }
  }

  const nestedUl = li.children('ul, ol').first();
  const children =
    nestedUl.length > 0 ? parseSidebarList($, nestedUl, baseUrl, depth + 1) : [];

  return { title, url, depth, order, children };
}

function buildNavigationTree(roots: RawNavItem[]): NavigationTree {
  const tree: NavigationTree = {};

  for (const root of roots) {
    const domainSlug = slugify(root.title);
    tree[domainSlug] = {
      title: root.title,
      slug: domainSlug,
      url: root.url,
      children: root.children.map((c) => toNavigationNode(c)),
    };
  }

  return tree;
}

function toNavigationNode(item: RawNavItem): NavigationNode {
  return {
    title: item.title,
    slug: slugify(item.title),
    url: item.url,
    depth: item.depth,
    order: item.order,
    children: item.children.map((c) => toNavigationNode(c)),
  };
}

function flattenNavigation(tree: NavigationTree, baseUrl: string): FlatNavItem[] {
  const flat: FlatNavItem[] = [];

  for (const [domainSlug, branch] of Object.entries(tree)) {
    const rootPath = [domainSlug];
    const rootTitles = [branch.title];

    if (branch.url) {
      flat.push({
        title: branch.title,
        slug: branch.slug,
        url: branch.url,
        domain: domainSlug,
        depth: 0,
        order: 0,
        navPath: rootPath,
        pathTitles: rootTitles,
      });
    }

    flattenNodes(branch.children, domainSlug, flat, baseUrl, branch.slug, rootPath, rootTitles);
  }

  return flat;
}

function flattenNodes(
  nodes: NavigationNode[],
  domain: string,
  flat: FlatNavItem[],
  _baseUrl: string,
  parentSlug?: string,
  parentPath: string[] = [],
  parentTitles: string[] = [],
): void {
  for (const node of nodes) {
    const navPath = [...parentPath, node.slug];
    const pathTitles = [...parentTitles, node.title];

    if (node.url) {
      flat.push({
        title: node.title,
        slug: node.slug,
        url: node.url,
        domain,
        depth: node.depth,
        order: node.order,
        parentSlug,
        navPath,
        pathTitles,
      });
    }
    flattenNodes(node.children, domain, flat, _baseUrl, node.slug, navPath, pathTitles);
  }
}
