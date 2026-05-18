import fs from 'fs-extra';
import path from 'node:path';
import { STORAGE_PATHS, OPENAPI_PATTERNS } from '../config/constants.js';
import type { InterceptedApiCall } from '../types/document.js';
import { logger } from '../utils/logger.js';
import { urlHash } from '../utils/hash.js';

export function isOpenApiUrl(url: string): boolean {
  return OPENAPI_PATTERNS.some((p) => p.test(url));
}

export async function saveOpenApiSpec(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<string> {
  await fs.ensureDir(STORAGE_PATHS.openapi);

  const hash = urlHash(url);
  const ext = url.includes('.yaml') ? 'yaml' : 'json';
  const filename = `openapi-${hash}.${ext}`;
  const filepath = path.join(STORAGE_PATHS.openapi, filename);

  await fs.writeFile(filepath, body, 'utf8');

  const meta = {
    url,
    savedAt: new Date().toISOString(),
    headers: sanitizeHeaders(headers),
    filepath,
  };

  await fs.writeJson(`${filepath}.meta.json`, meta, { spaces: 2 });
  logger.info(`OpenAPI spec saved: ${filename}`);

  return filepath;
}

export async function processInterceptedCalls(
  calls: InterceptedApiCall[],
): Promise<string[]> {
  const saved: string[] = [];

  for (const call of calls) {
    if (
      call.resourceType !== 'openapi' &&
      call.resourceType !== 'swagger' &&
      !isOpenApiUrl(call.url)
    ) {
      continue;
    }

    if (!call.responseBody) continue;

    try {
      const parsed = JSON.parse(call.responseBody);
          if (parsed.openapi || parsed.swagger) {
        const filepath = await saveOpenApiSpec(call.url, call.responseBody, call.headers);
        saved.push(filepath);
      }
    } catch {
      if (call.responseBody.includes('openapi') || call.responseBody.includes('swagger')) {
        const filepath = await saveOpenApiSpec(call.url, call.responseBody, call.headers);
        saved.push(filepath);
      }
    }
  }

  return saved;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  const sensitive = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

  for (const [key, value] of Object.entries(headers)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = value;
    }
  }

  return safe;
}

export function parseOpenApiEndpoints(
  spec: Record<string, unknown>,
): Array<{ method: string; path: string; summary?: string }> {
  const endpoints: Array<{ method: string; path: string; summary?: string }> = [];
  const paths = spec.paths as Record<string, Record<string, { summary?: string }>> | undefined;

  if (!paths) return endpoints;

  for (const [pathKey, methods] of Object.entries(paths)) {
    for (const [method, details] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        endpoints.push({
          method: method.toUpperCase(),
          path: pathKey,
          summary: details?.summary,
        });
      }
    }
  }

  return endpoints;
}
