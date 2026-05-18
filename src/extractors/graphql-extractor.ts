import fs from 'fs-extra';
import path from 'node:path';
import { STORAGE_PATHS, GRAPHQL_PATTERNS } from '../config/constants.js';
import type { InterceptedApiCall } from '../types/document.js';
import { logger } from '../utils/logger.js';
import { urlHash } from '../utils/hash.js';

export function isGraphqlUrl(url: string): boolean {
  return GRAPHQL_PATTERNS.some((p) => p.test(url));
}

export interface GraphqlOperation {
  name?: string;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  query: string;
  variables?: Record<string, unknown>;
}

export async function saveGraphqlPayload(
  url: string,
  requestBody: string,
  responseBody: string | undefined,
  headers: Record<string, string>,
): Promise<string> {
  await fs.ensureDir(STORAGE_PATHS.graphql);

  const hash = urlHash(url);
  const filename = `graphql-${hash}.json`;
  const filepath = path.join(STORAGE_PATHS.graphql, filename);

  let parsedRequest: unknown;
  try {
    parsedRequest = JSON.parse(requestBody);
  } catch {
    parsedRequest = { raw: requestBody };
  }

  let parsedResponse: unknown;
  if (responseBody) {
    try {
      parsedResponse = JSON.parse(responseBody);
    } catch {
      parsedResponse = { raw: responseBody };
    }
  }

  const payload = {
    url,
    savedAt: new Date().toISOString(),
    headers: sanitizeHeaders(headers),
    request: parsedRequest,
    response: parsedResponse,
  };

  await fs.writeJson(filepath, payload, { spaces: 2 });
  logger.info(`GraphQL payload saved: ${filename}`);

  return filepath;
}

export async function processGraphqlCalls(
  calls: InterceptedApiCall[],
): Promise<string[]> {
  const saved: string[] = [];

  for (const call of calls) {
    if (call.resourceType !== 'graphql' && !isGraphqlUrl(call.url)) continue;
    if (!call.requestBody) continue;

    const filepath = await saveGraphqlPayload(
      call.url,
      call.requestBody,
      call.responseBody,
      call.headers,
    );
    saved.push(filepath);
  }

  return saved;
}

export function parseGraphqlOperations(query: string): GraphqlOperation[] {
  const operations: GraphqlOperation[] = [];
  const operationRegex = /\b(query|mutation|subscription)\s+(\w+)?[^{]*\{/gi;
  let match: RegExpExecArray | null;

  while ((match = operationRegex.exec(query)) !== null) {
    operations.push({
      name: match[2],
      type: match[1].toLowerCase() as GraphqlOperation['type'],
      query,
    });
  }

  if (operations.length === 0 && query.trim()) {
    operations.push({ type: 'unknown', query });
  }

  return operations;
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  const sensitive = ['authorization', 'cookie', 'x-api-key'];

  for (const [key, value] of Object.entries(headers)) {
    safe[key] = sensitive.some((s) => key.toLowerCase().includes(s)) ? '[REDACTED]' : value;
  }

  return safe;
}
