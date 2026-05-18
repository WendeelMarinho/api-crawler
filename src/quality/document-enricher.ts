import type { FlatNavItem } from '../types/navigation.js';
import type { SemanticDocument } from '../types/document.js';
import type { EndpointDefinition } from '../types/endpoint.js';
import type { ExtractionQuality } from '../types/quality.js';
import { slugFromUrl } from '../utils/slugify.js';
import { contentHasPlaceholders, isPlaceholderText, sanitizeText } from './placeholders.js';

import { computeWeightedExtractionScore } from './weighted-quality-score.js';

export type { ExtractionQuality };

const BAD_TITLE = /^(200\s*ok?|200|loading|untitled|page)$/i;

function titleFromPathTitles(pathTitles?: string[]): string | undefined {
  if (!pathTitles?.length) return undefined;
  const leaf = pathTitles[pathTitles.length - 1]?.trim();
  if (!leaf || BAD_TITLE.test(leaf)) return undefined;
  return cleanSidebarTitle(leaf);
}

function titleFromNavPath(pathTitles?: string[]): string | undefined {
  if (!pathTitles || pathTitles.length < 2) return undefined;
  const section = pathTitles[pathTitles.length - 2]?.trim();
  const leaf = pathTitles[pathTitles.length - 1]?.trim();
  if (!section || !leaf || BAD_TITLE.test(leaf)) return undefined;
  if (BAD_TITLE.test(section)) return cleanSidebarTitle(leaf);
  return `${cleanSidebarTitle(section)} — ${cleanSidebarTitle(leaf)}`;
}

export function resolveDocumentTitle(
  doc: Pick<SemanticDocument, 'title' | 'url' | 'endpoint' | 'type' | 'extractionSignals'>,
  navItem?: FlatNavItem,
  baseUrl?: string,
): string {
  if (doc.extractionSignals?.domSourceOfTruth) {
    const epSum = doc.endpoint?.summary?.trim();
    if (epSum && !BAD_TITLE.test(epSum) && !isPlaceholderText(epSum)) {
      return cleanSidebarTitle(epSum);
    }
    const fromNav = titleFromPathTitles(navItem?.pathTitles);
    if (fromNav) return cleanSidebarTitle(fromNav);
  }

  const candidates: string[] = [];

  if (
    doc.type === 'endpoint' &&
    doc.endpoint?.summary &&
    !BAD_TITLE.test(doc.endpoint.summary.trim()) &&
    !isPlaceholderText(doc.endpoint.summary)
  ) {
    candidates.push(doc.endpoint.summary);
  }

  const fromPathLeaf = titleFromPathTitles(navItem?.pathTitles);
  if (fromPathLeaf) candidates.push(fromPathLeaf);

  const fromPathSection = titleFromNavPath(navItem?.pathTitles);
  if (fromPathSection && fromPathSection !== fromPathLeaf) {
    candidates.push(fromPathSection);
  }

  if (navItem?.title && !BAD_TITLE.test(navItem.title.trim())) {
    candidates.push(cleanSidebarTitle(navItem.title));
  }

  if (doc.endpoint?.description && !isPlaceholderText(doc.endpoint.description)) {
    candidates.push(doc.endpoint.description);
  }

  if (baseUrl) {
    const slug = slugFromUrl(doc.url, baseUrl);
    if (slug && slug !== 'page') {
      candidates.push(humanizeSlug(slug));
    }
  }

  if (doc.endpoint?.method && doc.endpoint.path) {
    candidates.push(`${doc.endpoint.method} ${doc.endpoint.path}`);
  }

  if (!BAD_TITLE.test(doc.title.trim())) {
    candidates.push(doc.title);
  }

  return candidates.find((c) => c.length > 2) ?? doc.title;
}

function cleanSidebarTitle(title: string): string {
  const spaced = title
    .replace(/([a-z])(post|get|put|patch|delete|head|options)$/i, '$1 $2')
    .trim();
  return (
    spaced
      .replace(/(get|post|put|patch|delete|head|options)$/i, '')
      .trim() || title
  );
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/^(get|post|put|patch|delete)-/i, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function assessExtractionQuality(doc: SemanticDocument): ExtractionQuality {
  const issues: string[] = [];

  if (doc.extractionSignals?.domViolations?.length) {
    issues.push('dom_assertion_failed');
  }

  if (BAD_TITLE.test(doc.title.trim())) issues.push('bad_title');
  if (contentHasPlaceholders(doc.content) || contentHasPlaceholders(doc.markdown)) {
    issues.push('placeholders');
  }

  if (doc.type === 'endpoint' && doc.endpoint) {
    const ep = doc.endpoint;
    if (
      ep.bodyParams?.some((p) => isPlaceholderText(p.name) || isPlaceholderText(p.description))
    ) {
      issues.push('params_placeholder');
    }
    const needsBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    if (needsBody && (!ep.bodyParams || ep.bodyParams.length === 0)) {
      issues.push('missing_body_params');
    }
    if (!ep.responses?.length && !ep.response) issues.push('no_responses');
    if (!ep.examples?.length && !doc.codeBlocks?.length) issues.push('no_examples');
  }

  if (issues.length === 0) return 'complete';
  if (issues.includes('bad_title') && issues.includes('placeholders')) return 'failed';
  return 'partial';
}

export function sanitizeEndpoint(endpoint: EndpointDefinition): EndpointDefinition {
  return {
    ...endpoint,
    summary: sanitizeText(endpoint.summary),
    description: sanitizeText(endpoint.description),
    bodyParams: endpoint.bodyParams?.filter((p) => !isPlaceholderText(p.name)),
    queryParams: endpoint.queryParams?.filter((p) => !isPlaceholderText(p.name)),
    headers: endpoint.headers?.filter((p) => !isPlaceholderText(p.name)),
  };
}

export function enrichDocument(
  doc: SemanticDocument,
  options: { navItem?: FlatNavItem; baseUrl: string },
): SemanticDocument {
  const title = resolveDocumentTitle(doc, options.navItem, options.baseUrl);
  const endpoint = doc.endpoint ? sanitizeEndpoint(doc.endpoint) : undefined;
  const enriched: SemanticDocument = {
    ...doc,
    title,
    endpoint,
    description: sanitizeText(doc.description) ?? doc.description,
  };
  const extractionQuality = assessExtractionQuality(enriched);
  const qualityScore = computeWeightedExtractionScore(enriched);
  return {
    ...enriched,
    extractionQuality,
    extractionSignals: {
      ...enriched.extractionSignals,
      qualityScore,
    },
  };
}
