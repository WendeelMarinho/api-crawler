import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { FrameworkSelectors } from '../config/selectors.js';
import { FRAMEWORK_DETECTORS, FRAMEWORK_SELECTORS } from '../config/selectors.js';
import type { DocFramework } from '../types/domain.js';
import type { Heading } from '../types/document.js';
import { normalizeWhitespace } from '../utils/cleaner.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.use(gfm);

export interface HtmlExtractionResult {
  title: string;
  html: string;
  markdown: string;
  description: string;
  headings: Heading[];
  breadcrumbs: string[];
  framework: DocFramework;
}

export function detectFramework(html: string): DocFramework {
  for (const { framework, patterns } of FRAMEWORK_DETECTORS) {
    if (patterns.some((p) => p.test(html))) {
      return framework;
    }
  }
  if (/readme/i.test(html) || /rm-Sidebar/i.test(html)) return 'readme';
  return 'unknown';
}

function firstMatch($: cheerio.CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length > 0) return el;
  }
  return $('body');
}

export function extractMainContent(
  html: string,
  framework?: DocFramework,
): HtmlExtractionResult {
  const detectedFramework = framework ?? detectFramework(html);
  const selectors: FrameworkSelectors = FRAMEWORK_SELECTORS[detectedFramework];

  const clone = cheerio.load(html);
  for (const removeSelector of selectors.remove) {
    clone(removeSelector).remove();
  }

  const mainEl = firstMatch(clone, selectors.mainContent);
  const contentHtml = mainEl.html() ?? '';

  const titleEl = firstMatch(clone, selectors.title);
  const title = normalizeWhitespace(titleEl.text()) || 'Untitled';

  const breadcrumbs: string[] = [];
  for (const bcSelector of selectors.breadcrumbs) {
    clone(bcSelector)
      .find('a, span, li')
      .each((_, el) => {
        const text = normalizeWhitespace(clone(el).text());
        if (text && !breadcrumbs.includes(text)) breadcrumbs.push(text);
      });
    if (breadcrumbs.length > 0) break;
  }

  const headings: Heading[] = [];
  mainEl.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = clone(el).prop('tagName')?.toLowerCase() ?? 'h2';
    const level = parseInt(tag.replace('h', ''), 10);
    headings.push({
      level,
      text: normalizeWhitespace(clone(el).text()),
      id: clone(el).attr('id'),
    });
  });

  const firstP = mainEl.find('p').first().text();
  const description = normalizeWhitespace(firstP).slice(0, 500);

  const markdown = turndown.turndown(contentHtml || '<p></p>');

  return {
    title,
    html: contentHtml,
    markdown,
    description,
    headings,
    breadcrumbs,
    framework: detectedFramework,
  };
}

export function extractPageLinks(
  html: string,
  baseUrl: string,
  framework?: DocFramework,
): string[] {
  const $ = cheerio.load(html);
  const detectedFramework = framework ?? detectFramework(html);
  const selectors = FRAMEWORK_SELECTORS[detectedFramework];
  const links = new Set<string>();
  const base = new URL(baseUrl);

  const linkSelectors = [...selectors.navLinks, 'main a[href]', 'article a[href]'];

  for (const selector of linkSelectors) {
    $(selector).each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      try {
        const absolute = new URL(href, baseUrl);
        if (absolute.hostname === base.hostname) {
          absolute.hash = '';
          links.add(absolute.href);
        }
      } catch {
        // invalid URL
      }
    });
  }

  return [...links];
}
