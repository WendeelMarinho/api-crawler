import path from 'node:path';
import { STORAGE_PATHS } from '../config/constants.js';
import { safeSlug } from './slugify.js';
import { urlHash } from './hash.js';

const MAX_SEGMENT = 80;
const MAX_FILENAME_LENGTH = 120;

function safeSegment(value: string, max = MAX_SEGMENT): string {
  return safeSlug(value, max);
}

/** @deprecated Use buildMarkdownPath — kept for callers passing only domain + filename */
export function buildDomainPath(domain: string, filename: string, subfolders: string[] = []): string {
  return buildMarkdownPath(domain, filename, subfolders);
}

export function buildJsonPath(domain: string, filename: string, subfolders: string[] = []): string {
  const safeDomain = safeSegment(domain) || 'general';
  const base = filename.endsWith('.json') ? filename.slice(0, -5) : filename.replace(/\.md$/, '');
  const safeFilename = `${safeSegment(base, MAX_FILENAME_LENGTH)}.json`;
  const segments = subfolders.map((s) => safeSegment(s)).filter(Boolean);
  return path.join(STORAGE_PATHS.json, safeDomain, ...segments, safeFilename);
}

export function buildMarkdownPath(domain: string, filename: string, subfolders: string[] = []): string {
  const safeDomain = safeSegment(domain) || 'general';
  const base = filename.endsWith('.md') ? filename.slice(0, -3) : filename.replace(/\.json$/, '');
  const safeFilename = `${safeSegment(base, MAX_FILENAME_LENGTH)}.md`;
  const segments = subfolders.map((s) => safeSegment(s)).filter(Boolean);
  return path.join(STORAGE_PATHS.markdown, safeDomain, ...segments, safeFilename);
}

export function buildRawHtmlPath(domain: string, fileId: string): string {
  const safeDomain = safeSegment(domain) || 'general';
  const safeId = fileId.length <= 24 ? fileId : urlHash(fileId);
  return path.join(STORAGE_PATHS.rawHtml, safeDomain, `${safeId}.html`);
}

export function buildChunkPath(domain: string, chunkId: string): string {
  const safeDomain = safeSegment(domain) || 'general';
  const safeChunk = chunkId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return path.join(STORAGE_PATHS.chunks, safeDomain, `${safeChunk}.json`);
}

export function buildScreenshotPath(url: string): string {
  const id = urlHash(url);
  return path.join(STORAGE_PATHS.screenshots, `err-${id}-${Date.now()}.png`);
}

export function buildExtractionDebugDir(docId: string): string {
  const safe = docId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || urlHash(docId);
  return path.join(STORAGE_PATHS.extractionDebug, safe);
}

export function relativeStoragePath(absolutePath: string): string {
  return path.relative(STORAGE_PATHS.markdown, absolutePath);
}
