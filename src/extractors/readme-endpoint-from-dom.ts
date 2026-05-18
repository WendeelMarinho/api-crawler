import type { ReadmeDomSnapshot } from '../types/readme-dom.js';
import type { EndpointDefinition, HttpMethod } from '../types/endpoint.js';
import { resolvePathParamsFromTemplate } from '../utils/path-params-from-template.js';

/**
 * Build the final `EndpointDefinition` exclusively from a Playwright DOM snapshot.
 * No Cheerio / OpenAPI merge — used when method + path were read from the live ReadMe UI.
 */
export function buildEndpointDefinitionFromReadmeDom(dom: ReadmeDomSnapshot): EndpointDefinition | undefined {
  if (!dom.method || !dom.path) return undefined;

  const authRequired =
    dom.headers.some((h) => /authorization/i.test(h.name)) ||
    dom.tryItSamples.some((e) => /authorization/i.test(e.code));

  return {
    method: dom.method as HttpMethod,
    path: dom.path,
    summary: dom.summary ?? dom.pageTitle,
    description: dom.description,
    headers: dom.headers,
    queryParams: dom.queryParams,
    pathParams: resolvePathParamsFromTemplate(dom.path),
    bodyParams: dom.bodyParams,
    request: undefined,
    response: undefined,
    responses: dom.responses,
    authRequired,
    examples: dom.tryItSamples,
    tags: [],
  };
}
