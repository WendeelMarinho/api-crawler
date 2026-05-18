import * as cheerio from 'cheerio';
import type { Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { HTTP_METHODS } from '../config/constants.js';
import type {
  HttpMethod,
  EndpointDefinition,
  EndpointParam,
  EndpointExample,
  EndpointResponse,
} from '../types/endpoint.js';
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

  const bodyFromReadme = extractReadmeParams($, 'body');
  const headersFromReadme = extractReadmeParams($, 'header');
  const queryFromReadme = extractReadmeParams($, 'query');
  const responsesFromReadme = extractReadmeResponses($);

  const bodyParams =
    bodyFromReadme.length > 0 ? bodyFromReadme : extractParamsFromTables($, 'body');
  const headers =
    headersFromReadme.length > 0 ? headersFromReadme : extractParamsFromTables($, 'header');
  const queryParams =
    queryFromReadme.length > 0 ? queryFromReadme : extractParamsFromTables($, 'query');
  const responses =
    responsesFromReadme.length > 0 ? responsesFromReadme : extractResponses($);

  const examples = extractCodeExamples($);
  const serverUrl = extractServerUrl($);

  let description = extractDescription($);
  if (serverUrl && description && !description.includes(serverUrl)) {
    description = `${description}\n\nBase URL: ${serverUrl}`;
  } else if (serverUrl && !description) {
    description = `Base URL: ${serverUrl}`;
  }

  return {
    method,
    path,
    summary: extractSummary($),
    description,
    headers,
    queryParams,
    pathParams: extractPathParams(path),
    bodyParams,
    request: extractJsonExample($, 'request'),
    response: extractJsonExample($, 'response'),
    responses,
    authRequired: detectAuthRequired(combined) || headers.some((h) => /auth/i.test(h.name)),
    examples,
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
  const server = $('[data-testid="serverurl"]').first().attr('title') ?? $('[data-testid="serverurl"]').first().text();
  if (server) {
    try {
      const u = new URL(server.trim());
      return u.pathname || '/';
    } catch {
      const m = server.match(PATH_PATTERN);
      if (m) return m[1];
    }
  }

  const pathSelectors = ['.rm-APIPath', '[class*="APIPath"]', '[class*="path"]', 'code', 'h1'];

  for (const selector of pathSelectors) {
    const el = $(selector).first();
    const content = el.text().trim();
    const match = content.match(PATH_PATTERN);
    if (match) return match[1];
  }

  const match = text.match(PATH_PATTERN);
  return match?.[1];
}

function extractServerUrl($: cheerio.CheerioAPI): string | undefined {
  const el = $('[data-testid="serverurl"]').first();
  const title = el.attr('title')?.trim();
  if (title?.startsWith('http')) return title.replace(/<!--\s*-->/g, '');
  const text = normalizeWhitespace(el.text());
  if (text.startsWith('http')) return text.split(/\s/)[0];
  return undefined;
}

function extractSummary($: cheerio.CheerioAPI): string | undefined {
  const pageTitle = $('title').first().text().trim();
  if (pageTitle && !/^readme$/i.test(pageTitle)) {
    return normalizeWhitespace(pageTitle);
  }

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
  const parts: string[] = [];

  $(
    '.rm-APIHeader .rm-Markdown, .excerptT2m-MzSJGRK7 .rm-Markdown, header .rm-Markdown[data-testid="RDMD"]',
  )
    .first()
    .find('p')
    .each((_, el) => {
      const t = normalizeWhitespace($(el).text());
      if (t && !/^200\s*ok?$/i.test(t)) parts.push(t);
    });

  $('header .rm-Markdown blockquote, .rm-APIHeader blockquote').each((_, el) => {
    const t = normalizeWhitespace($(el).text());
    if (t) parts.push(t);
  });

  if (parts.length > 0) return parts.join('\n\n');

  const meta = $('meta[name="description"]').attr('content');
  if (meta) {
    const t = normalizeWhitespace(meta);
    if (t.length > 20) return t;
  }

  const firstP = $('article p, main p, .rm-Article p').first().text();
  return firstP ? normalizeWhitespace(firstP) : undefined;
}

/** ReadMe API reference: params live in .rm-ParamContainer, not tables. */
function extractReadmeParams(
  $: cheerio.CheerioAPI,
  section: 'body' | 'header' | 'query',
): EndpointParam[] {
  const sectionTitles: Record<string, string[]> = {
    body: ['body params', 'body parameters', 'corpo'],
    header: ['headers', 'cabeçalho'],
    query: ['query params', 'query parameters', 'parâmetros de consulta'],
  };

  const titles = sectionTitles[section];
  const container = findReadmeParamSection($, titles);
  if (!container.length) return [];

  return parseReadmeParamContainer($, container, section === 'body' ? 'body' : section);
}

function findReadmeParamSection(
  $: cheerio.CheerioAPI,
  titles: string[],
): Cheerio<AnyNode> {
  const headings = $('[class*="APISectionHeader-heading"]').toArray();
  for (const heading of headings) {
    const label = normalizeWhitespace($(heading).text()).toLowerCase();
    if (!titles.some((t) => label === t || label.startsWith(t))) continue;

    const container = $(heading).closest('header').nextAll('.rm-ParamContainer').first();
    if (container.length) return container;
  }
  return $();
}

function parseReadmeParamContainer(
  $: cheerio.CheerioAPI,
  container: Cheerio<AnyNode>,
  paramIn: EndpointParam['in'],
): EndpointParam[] {
  const params: EndpointParam[] = [];
  const seen = new Set<string>();

  container.find('.form-group.field').each((_, field) => {
    const $field = $(field);
    if (!$field.find('[class*="Param-header"], [class*="Param-name"]').length) return;

    const forId =
      $field.find('input[id], select[id], textarea[id]').first().attr('id') ??
      $field.find('label[class*="Param-name"]').attr('for');

    let name = '';
    if (forId) {
      const suffix = forId.split('_').pop();
      name = suffix ?? forId;
    }
    if (!name) {
      name = normalizeWhitespace($field.find('[class*="Param-name"]').first().text());
    }

    if (!name || /retrieving|loadingloading|^loading$/i.test(name)) return;
    if (seen.has(name)) return;
    seen.add(name);

    const type = normalizeWhitespace($field.find('[class*="Param-type"]').first().text());
    const required = $field.find('[class*="Param-required"]').length > 0;
    const description = normalizeWhitespace(
      $field.find('.Param-description p, .field-description p').first().text(),
    );
    const placeholder = $field.find('input').attr('placeholder');

    params.push({
      name,
      type: type || undefined,
      required,
      description: description || undefined,
      default: placeholder || undefined,
      in: paramIn,
    });
  });

  return params;
}

function extractReadmeResponses($: cheerio.CheerioAPI): EndpointResponse[] {
  const responses: EndpointResponse[] = [];
  const seen = new Set<string>();

  $('[class*="APIResponseSchemaPicker-option"]').each((_, opt) => {
    const $opt = $(opt);

    let statusCode: string | undefined;
    $opt.find('[aria-label]').each((__, el) => {
      const label = $(el).attr('aria-label')?.trim();
      if (label && /^\d{3}$/.test(label)) statusCode = label;
    });

    const labelText = normalizeWhitespace(
      $opt.find('[class*="APIResponseSchemaPicker-label"]').text(),
    );
    const description =
      normalizeWhitespace($opt.find('[class*="APIResponseSchemaPicker-description"]').text()) ||
      labelText;

    if (!statusCode) {
      const fromLabel = labelText.match(/\b(\d{3})\b/);
      if (fromLabel) statusCode = fromLabel[1];
      else if (/^OK$/i.test(description)) statusCode = '200';
      else if (/bad request/i.test(description)) statusCode = '400';
      else if (/forbidden/i.test(description)) statusCode = '403';
      else if (/not found/i.test(description)) statusCode = '404';
    }

    if (!statusCode || seen.has(statusCode)) return;
    seen.add(statusCode);

    responses.push({
      statusCode,
      description: description || undefined,
    });
  });

  return responses.sort((a, b) => a.statusCode.localeCompare(b.statusCode));
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
        const cells = $(row)
          .find('td')
          .map((___, td) => $(td).text().trim())
          .get();
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
  const candidates: { lang: string; code: string; score: number }[] = [];

  $('pre').each((_, pre) => {
    let code = $(pre).find('code').text() || $(pre).text();
    code = code.replace(/x{6,}\d*/g, '').replace(/\\n/g, '\n').trim();
    if (!code || /loadingloading|^loading$/i.test(code)) return;

    const lang =
      $(pre).find('code').attr('class')?.match(/language-(\w+)/)?.[1] ??
      (/curl|request\s+(GET|POST|PUT|PATCH|DELETE)/i.test(code) ? 'bash' : 'text');

    let score = code.length;
    if (/curl\s+--request/i.test(code)) score += 500;
    if (/--url\s+https?:\/\//i.test(code)) score += 300;
    if (/Authorization/i.test(code)) score += 100;

    candidates.push({ lang, code, score });
  });

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return [{ language: best.lang, code: best.code, label: 'Try It' }];
}

export function isEndpointPage(html: string, markdown: string): boolean {
  return extractEndpoint(html, markdown) !== undefined;
}
