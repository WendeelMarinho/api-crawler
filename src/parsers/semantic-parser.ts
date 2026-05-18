import type { SemanticDocument } from '../types/document.js';
import type { FlatNavItem, ArchitectureMap } from '../types/navigation.js';
import type { ReadmeDomSnapshot } from '../types/readme-dom.js';
import { extractMainContent } from '../extractors/html-extractor.js';
import { extractEndpoint } from '../extractors/endpoint-extractor.js';
import { mergeEndpointWithReadmeDom } from '../extractors/readme-dom-extractor.js';
import { buildEndpointDefinitionFromReadmeDom } from '../extractors/readme-endpoint-from-dom.js';
import { extractCodeBlocks } from '../extractors/codeblock-extractor.js';
import { extractTables } from '../extractors/table-extractor.js';
import { extractSchemas, schemasToCodeBlocks } from '../extractors/schema-extractor.js';
import { resolveDomain, filenameFromDocument } from './domain-parser.js';
import { enrichDocument } from '../quality/document-enricher.js';
import { contentHash, urlHash } from '../utils/hash.js';
import { slugify } from '../utils/slugify.js';
import { dedupeCodeBlocksByFingerprint } from '../utils/extraction-fingerprints.js';

export interface ParsePageInput {
  url: string;
  html: string;
  baseUrl: string;
  navItem?: FlatNavItem;
  /** Live DOM snapshot from Playwright (Dock ReadMe reference pages). */
  readmeDom?: ReadmeDomSnapshot | null;
}

export function parsePage(input: ParsePageInput): SemanticDocument {
  const { url, html, baseUrl, navItem, readmeDom } = input;
  const extracted = extractMainContent(html);
  const { domain, subcategory } = resolveDomain(url, baseUrl, navItem);
  const storageSegments =
    navItem?.navPath && navItem.navPath.length > 2 ? navItem.navPath.slice(1, -1) : [];
  let breadcrumbs =
    navItem?.pathTitles && navItem.pathTitles.length > 0
      ? navItem.pathTitles
      : extracted.breadcrumbs;
  if (readmeDom?.breadcrumbs?.length) {
    breadcrumbs = readmeDom.breadcrumbs;
  }

  const readmeDomPrimary =
    readmeDom?.source === 'playwright-dom' && Boolean(readmeDom.method && readmeDom.path);

  const cheerioEp = readmeDomPrimary ? undefined : extractEndpoint(html, extracted.markdown);

  const endpoint =
    readmeDomPrimary && readmeDom
      ? buildEndpointDefinitionFromReadmeDom(readmeDom)
      : readmeDom && readmeDom.method && readmeDom.path
        ? mergeEndpointWithReadmeDom(cheerioEp, readmeDom)
        : cheerioEp;

  let pageTitle = extracted.title;
  let pageDescription = extracted.description;
  if (readmeDom?.pageTitle && !/^(200\s*ok?|readme)$/i.test(readmeDom.pageTitle.trim())) {
    pageTitle = readmeDom.pageTitle;
  }
  if (readmeDom?.description && readmeDom.description.length > (pageDescription?.length ?? 0)) {
    pageDescription = readmeDom.description;
  }

  const cheerioCodeBlocks = readmeDomPrimary ? [] : extractCodeBlocks(html);
  const tables = extractTables(html);
  const schemas = extractSchemas(html);
  const schemaBlocks = schemasToCodeBlocks(schemas);

  const tryItBlocks =
    readmeDom?.tryItSamples?.map((s) => ({
      language: s.language,
      code: s.code,
      label: s.label,
      sourceTab: s.sourceTab,
      snippetHash: s.snippetHash,
      exampleType: 'try-it' as const,
    })) ?? [];

  const type = determineDocumentType(endpoint, pageTitle, url);
  const tags = buildTags(domain, subcategory, type, endpoint);

  const markdown = extracted.markdown;
  const textContent = [pageTitle, pageDescription, markdown].filter(Boolean).join('\n');

  const extractionSignals =
    readmeDom && readmeDom.source === 'playwright-dom'
      ? {
          domExtraction: true,
          domSourceOfTruth: readmeDomPrimary,
          bodyParamCount: readmeDom.bodyParams.length,
          headerCount: readmeDom.headers.length,
          responseCount: readmeDom.responses.length,
          tryItLanguageCount: readmeDom.tryItSamples.length,
          domViolations:
            readmeDom.domAssertionViolations && readmeDom.domAssertionViolations.length > 0
              ? readmeDom.domAssertionViolations
              : undefined,
        }
      : undefined;

  const codeBlockParts = dedupeCodeBlocksByFingerprint(
    [...tryItBlocks, ...cheerioCodeBlocks, ...schemaBlocks].filter(
      (b) => !/loadingloading|^loading$/i.test(b.code.trim()),
    ),
  );

  const examples = readmeDomPrimary
    ? tryItBlocks.filter((b) => !/loadingloading|^loading$/i.test(b.code.trim()))
    : codeBlockParts.filter((b) => b.label?.toLowerCase().includes('example'));

  const base: SemanticDocument = {
    id: urlHash(url),
    title: pageTitle,
    domain,
    subcategory,
    storageSegments,
    type,
    url,
    content: textContent,
    markdown,
    description: pageDescription,
    headings: extracted.headings,
    tables,
    examples,
    codeBlocks: codeBlockParts,
    breadcrumbs,
    tags,
    endpoint,
    authRequired: endpoint?.authRequired,
    contentHash: contentHash(textContent),
    extractedAt: new Date().toISOString(),
    framework: extracted.framework,
    extractionSignals,
  };

  return enrichDocument(base, { navItem, baseUrl });
}

function determineDocumentType(
  endpoint: ReturnType<typeof extractEndpoint> | undefined,
  title: string,
  url: string,
): SemanticDocument['type'] {
  const u = `${title} ${url}`.toLowerCase();
  if (endpoint) return 'endpoint';
  if (/webhook|webhooks|callback(\s|-)?url/i.test(u)) return 'webhook';
  if (
    /\/oauth|\/openid|\/token|\/authorize|authentication|autentica(c|ç)ão|login|password\s*grant/i.test(
      url,
    ) ||
    /\b(auth|oauth|token)\b/i.test(title)
  ) {
    return 'auth';
  }
  if (/overview|sobre|introduction|introdução|getting started/i.test(title + url)) {
    return 'overview';
  }
  if (/schema|model|object/i.test(title)) return 'schema';
  if (/guide|tutorial|how to/i.test(title)) return 'guide';
  if (/changelog|release/i.test(title)) return 'changelog';
  return 'concept';
}

function buildTags(
  domain: string,
  subcategory: string,
  type: SemanticDocument['type'],
  endpoint?: ReturnType<typeof extractEndpoint>,
): string[] {
  const tags = new Set<string>([domain, type]);
  if (subcategory !== domain) tags.add(subcategory);
  if (endpoint) {
    tags.add(endpoint.method.toLowerCase());
    tags.add('api');
  }
  return [...tags];
}

export function inferArchitectureMap(documents: SemanticDocument[]): ArchitectureMap {
  const map: ArchitectureMap = {};
  const authDomain = Object.keys(
    documents.reduce<Record<string, boolean>>((acc, d) => {
      if (d.domain.includes('auth')) acc[d.domain] = true;
      return acc;
    }, {}),
  )[0];

  const domains = [...new Set(documents.map((d) => d.domain))];

  for (const domain of domains) {
    const domainDocs = documents.filter((d) => d.domain === domain);
    const endpoints = domainDocs
      .filter((d) => d.endpoint)
      .map((d) => `${d.endpoint!.method} ${d.endpoint!.path}`);

    const requiresAuth = domainDocs.some(
      (d) => d.authRequired || d.endpoint?.authRequired,
    );

    const related = domains.filter((other) => {
      if (other === domain) return false;
      return domainDocs.some((doc) =>
        doc.content.toLowerCase().includes(other.replace(/-/g, ' ')),
      );
    });

    const dependsOn: string[] = [];
    if (requiresAuth && authDomain && domain !== authDomain) {
      dependsOn.push(authDomain);
    }

    map[domain] = {
      title: domain.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      depends_on: dependsOn,
      related_domains: related.slice(0, 5),
      endpoints,
      requires_auth: requiresAuth,
      pages: domainDocs.map((d) => slugify(d.title)),
    };
  }

  return map;
}

export { filenameFromDocument };
