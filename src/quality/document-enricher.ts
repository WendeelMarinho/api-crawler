import type { FlatNavItem } from '../types/navigation.js';
import type { SemanticDocument } from '../types/document.js';
import type { EndpointDefinition } from '../types/endpoint.js';
import { slugFromUrl } from '../utils/slugify.js';
import { contentHasPlaceholders, isPlaceholderText, sanitizeText } from './placeholders.js';

import type { ExtractionQuality } from '../types/quality.js';

export type { ExtractionQuality };

const BAD_TITLE = /^(200\s*ok?|200|loading|untitled|page)$/i;

export function resolveDocumentTitle(
  doc: Pick<SemanticDocument, 'title' | 'url' | 'endpoint' | 'type'>,
  navItem?: FlatNavItem,
  baseUrl?: string,
): string {
  const candidates: string[] = [];

  if (navItem?.title && !BAD_TITLE.test(navItem.title.trim())) {
    candidates.push(cleanSidebarTitle(navItem.title));
  }

  if (doc.endpoint?.summary && !isPlaceholderText(doc.endpoint.summary)) {
    candidates.push(doc.endpoint.summary);
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
  return title
    .replace(/(get|post|put|patch|delete|head|options)$/i, '')
    .trim() || title;
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
  return { ...enriched, extractionQuality };
}
