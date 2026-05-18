import * as cheerio from 'cheerio';
import { HTTP_METHODS } from '../config/constants.js';
import type { HttpMethod, EndpointDefinition, EndpointParam, EndpointExample, EndpointResponse } from '../types/endpoint.js';
import { normalizeWhitespace } from '../utils/cleaner.js';

const METHOD_PATTERN = new RegExp(`\\b(${HTTP_METHODS.join('|')})\\b`, 'gi');
const PATH_PATTERN = /(?:^|\s|["'`])(\/[\w{}/.:_-]+)/;

export function extractEndpoint(html: string, markdown: string): EndpointDefinition | undefined {
  const $ = cheerio.load(html);
  const text = normalizeWhitespace($('body').text());
  const combined = `${text}\n${markdown}`;

  const method = detectMethod($, combined);
  if (!method) return undefined;

  const path = detectPath($, combined);
  if (!path) return undefined;

  return {
    method,
    path,
    summary: extractSummary($),
    description: extractDescription($),
    headers: extractParamsFromTables($, 'header'),
    queryParams: extractParamsFromTables($, 'query'),
    pathParams: extractPathParams(path),
    bodyParams: extractParamsFromTables($, 'body'),
    request: extractJsonExample($, 'request'),
    response: extractJsonExample($, 'response'),
    responses: extractResponses($),
    authRequired: detectAuthRequired(combined),
    examples: extractCodeExamples($),
    tags: [],
  };
}

function detectMethod($: cheerio.CheerioAPI, text: string): HttpMethod | undefined {
  const badgeSelectors = [
    '.rm-APIMethod',
    '[class*="HTTPMethod"]',
    '[class*="method-"]',
    '.api-method',
    '.http-verb',
    '.badge',
  ];

  for (const selector of badgeSelectors) {
    const badge = $(selector).first().text().trim().toUpperCase();
    if (HTTP_METHODS.includes(badge as HttpMethod)) {
      return badge as HttpMethod;
    }
  }

  const match = text.match(METHOD_PATTERN);
  if (match) {
    return match[1].toUpperCase() as HttpMethod;
  }

  return undefined;
}

function detectPath($: cheerio.CheerioAPI, text: string): string | undefined {
  const pathSelectors = [
    '[class*="path"]',
    '[class*="endpoint"]',
    '.rm-APIPath',
    'code',
    'h1',
  ];

  for (const selector of pathSelectors) {
    const el = $(selector).first();
    const content = el.text().trim();
    const match = content.match(PATH_PATTERN);
    if (match) return match[1];
  }

  const match = text.match(PATH_PATTERN);
  return match?.[1];
}

function extractSummary($: cheerio.CheerioAPI): string | undefined {
  const readmeTitle = $(
    '.rm-APIHeader-title, .rm-APIHeader h1, [class*="APIHeader"] h1, .rm-ReferenceMain .rm-APIMethod-heading',
  )
    .first()
    .text();
  if (readmeTitle) {
    const t = normalizeWhitespace(readmeTitle);
    if (t && !/^200\s*ok?$/i.test(t)) return t;
  }

  const pathLine = $('.rm-APIPath, [class*="APIPath"]').first().text();
  if (pathLine) {
    const t = normalizeWhitespace(pathLine);
    if (t.startsWith('/')) return t;
  }

  const h1 = $('h1').first().text();
  return h1 ? normalizeWhitespace(h1) : undefined;
}

function extractDescription($: cheerio.CheerioAPI): string | undefined {
  const firstP = $('article p, main p, .rm-Article p').first().text();
  return firstP ? normalizeWhitespace(firstP) : undefined;
}

function extractParamsFromTables(
  $: cheerio.CheerioAPI,
  paramType: 'header' | 'query' | 'body',
): EndpointParam[] {
  const params: EndpointParam[] = [];
  const sectionKeywords: Record<string, string[]> = {
    header: ['header', 'cabeçalho'],
    query: ['query', 'parâmetro', 'parameter', 'param'],
    body: ['body', 'request', 'corpo', 'payload'],
  };

  const keywords = sectionKeywords[paramType];

  $('table').each((_, table) => {
    const prevHeading = $(table).prevAll('h2, h3, h4').first().text().toLowerCase();
    const matchesSection = keywords.some((k) => prevHeading.includes(k));
    if (!matchesSection && paramType !== 'body') return;

    const headers: string[] = [];
    $(table)
      .find('thead th, tr:first-child th, tr:first-child td')
      .each((__, th) => {
        headers.push($(th).text().toLowerCase().trim());
      });

    const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('campo') || h.includes('field'));
    const typeIdx = headers.findIndex((h) => h.includes('type') || h.includes('tipo'));
    const reqIdx = headers.findIndex((h) => h.includes('required') || h.includes('obrigat'));
    const descIdx = headers.findIndex((h) => h.includes('desc'));

    $(table)
      .find('tbody tr')
      .each((__, row) => {
        const cells = $(row)
          .find('td')
          .map((___, td) => normalizeWhitespace($(td).text()))
          .get();

        if (cells.length === 0) return;

        const name = cells[nameIdx >= 0 ? nameIdx : 0];
        if (!name || /retrieving recent requests|loading/i.test(name)) return;

        params.push({
          name,
          type: typeIdx >= 0 ? cells[typeIdx] : undefined,
          required: reqIdx >= 0 ? /yes|sim|true|required|obrigat/i.test(cells[reqIdx]) : false,
          description: descIdx >= 0 ? cells[descIdx] : undefined,
          in: paramType === 'body' ? 'body' : paramType,
        });
      });
  });

  return params;
}

function extractPathParams(path: string): EndpointParam[] {
  const matches = path.match(/\{(\w+)\}/g) ?? [];
  return matches.map((m) => ({
    name: m.replace(/[{}]/g, ''),
    required: true,
    in: 'path' as const,
  }));
}

function extractJsonExample(
  $: cheerio.CheerioAPI,
  kind: 'request' | 'response',
): Record<string, unknown> | undefined {
  const keywords = kind === 'request' ? ['request', 'body', 'payload'] : ['response', 'resposta'];

  let found: Record<string, unknown> | undefined;

  $('pre code, pre').each((_, el) => {
    const text = $(el).text().trim();
    const section = $(el).prevAll('h2, h3, h4').first().text().toLowerCase();
    const isRelevant = keywords.some((k) => section.includes(k));

    if (isRelevant || text.startsWith('{')) {
      try {
        found = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // not JSON
      }
    }
  });

  return found;
}

function extractResponses($: cheerio.CheerioAPI): EndpointResponse[] {
  const responses: EndpointResponse[] = [];

  $('table').each((_, table) => {
    const heading = $(table).prevAll('h2, h3').first().text().toLowerCase();
    if (!heading.includes('response') && !heading.includes('resposta')) return;

    $(table)
      .find('tbody tr')
      .each((__, row) => {
        const cells = $(row).find('td').map((___, td) => $(td).text().trim()).get();
        if (cells.length >= 1) {
          responses.push({
            statusCode: cells[0],
            description: cells[1],
            example: cells[2],
          });
        }
      });
  });

  return responses;
}

function detectAuthRequired(text: string): boolean {
  return /auth(orization|enticat)|bearer|api[- ]?key|oauth|token required/i.test(text);
}

function extractCodeExamples($: cheerio.CheerioAPI): EndpointExample[] {
  const examples: EndpointExample[] = [];

  $('pre').each((_, pre) => {
    const code = $(pre).find('code').text() || $(pre).text();
    const lang =
      $(pre).find('code').attr('class')?.match(/language-(\w+)/)?.[1] ?? 'text';
    const label = $(pre).prev('p, h3, h4').first().text().trim();

    if (code.trim()) {
      examples.push({ language: lang, code: code.trim(), label: label || undefined });
    }
  });

  return examples;
}

export function isEndpointPage(html: string, markdown: string): boolean {
  return extractEndpoint(html, markdown) !== undefined;
}
