import { urlHash } from './hash.js';

const MAX_SLUG_LENGTH = 60;

export function slugify(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function safeSlug(text: string, maxLength = MAX_SLUG_LENGTH): string {
  const slug = slugify(text);
  if (!slug) return 'page';
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-+$/, '') || 'page';
}

export function slugFromUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    let path = parsed.pathname;
    const basePath = base.pathname.replace(/\/$/, '');
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length);
    }
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return 'index';
    return safeSlug(segments[segments.length - 1], MAX_SLUG_LENGTH);
  } catch {
    return urlHash(url);
  }
}

/** Readable, unique filename from URL slug (or endpoint) plus stable document id. */
export function filenameFromUrlAndTitle(
  url: string,
  title: string,
  baseUrl: string,
  endpointPath?: string,
  method?: string,
  docId?: string,
): string {
  const suffix = docId && docId.length > 0 ? `-${docId}` : `-${urlHash(url)}`;
  let base: string | undefined;

  if (method && endpointPath) {
    const pathPart = safeSlug(
      endpointPath.replace(/^\//, '').replace(/\//g, '-').replace(/[{}]/g, ''),
      60,
    );
    base = safeSlug(`${method.toLowerCase()}-${pathPart}`, 72);
  }

  if (!base) {
    const pageSlug = slugFromUrl(url, baseUrl);
    if (pageSlug && pageSlug !== 'index' && pageSlug !== 'page' && pageSlug !== 'inicio') {
      base = pageSlug;
    }
  }

  if (!base) {
    const label = safeSlug(title, 40);
    if (label && label !== 'untitled' && label !== 'page' && label !== '200') {
      base = label;
    }
  }

  base = base ?? urlHash(url);
  const combined = `${base}${suffix}`;
  return combined.length <= 100 ? `${combined}.md` : `${urlHash(url)}${suffix}.md`;
}

export function resolveDomainFromUrl(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    let path = parsed.pathname;
    const basePath = base.pathname.replace(/\/$/, '');
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length);
    }
    const segments = path.split('/').filter(Boolean);
    if (segments.length >= 2 && segments[1] === 'reference') {
      return safeSlug(segments[0], 48);
    }
    if (segments.length >= 1) {
      return safeSlug(segments[0], 48);
    }
  } catch {
    // fallthrough
  }
  return 'general';
}

export function domainFromPath(pathSegments: string[]): string {
  return pathSegments[0] ? safeSlug(pathSegments[0], 48) : 'general';
}
