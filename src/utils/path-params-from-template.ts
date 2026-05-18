import type { EndpointParam } from '../types/endpoint.js';

/** Infer OpenAPI-ish type from common path placeholder naming. */
export function inferPathParamTypeFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('uuid')) return 'string';
  if (/(^|_|-)id$/i.test(name) || lower.endsWith('id')) return 'string';
  if (lower.includes('count') || lower.includes('offset') || lower.includes('limit') || lower.includes('page'))
    return 'integer';
  return undefined;
}

/**
 * Ordered `{segment}` placeholders from the path template, deduped by first occurrence.
 * Required=true for all path params.
 */
export function resolvePathParamsFromTemplate(path: string): EndpointParam[] {
  const re = /\{([\w.-]+)\}/g;
  let m: RegExpExecArray | null;
  const order: string[] = [];
  const seen = new Set<string>();
  while ((m = re.exec(path)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  return order.map((name) => ({
    name,
    required: true,
    in: 'path' as const,
    type: inferPathParamTypeFromName(name),
  }));
}
