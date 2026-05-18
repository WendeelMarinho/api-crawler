import type { SemanticDocument } from '../types/document.js';
import type { FlatNavItem } from '../types/navigation.js';
import type { ArchitectureMap } from '../types/navigation.js';
import { extractMainContent } from '../extractors/html-extractor.js';
import { extractEndpoint } from '../extractors/endpoint-extractor.js';
import { extractCodeBlocks } from '../extractors/codeblock-extractor.js';
import { extractTables } from '../extractors/table-extractor.js';
import { extractSchemas, schemasToCodeBlocks } from '../extractors/schema-extractor.js';
import { resolveDomain, filenameFromDocument } from './domain-parser.js';
import { enrichDocument } from '../quality/document-enricher.js';
import { contentHash, urlHash } from '../utils/hash.js';
import { slugify } from '../utils/slugify.js';

export interface ParsePageInput {
  url: string;
  html: string;
  baseUrl: string;
  navItem?: FlatNavItem;
}

export function parsePage(input: ParsePageInput): SemanticDocument {
  const { url, html, baseUrl, navItem } = input;
  const extracted = extractMainContent(html);
  const { domain, subcategory } = resolveDomain(url, baseUrl, navItem);
  const storageSegments =
    navItem?.navPath && navItem.navPath.length > 2 ? navItem.navPath.slice(1, -1) : [];
  const breadcrumbs =
    navItem?.pathTitles && navItem.pathTitles.length > 0
      ? navItem.pathTitles
      : extracted.breadcrumbs;
  const endpoint = extractEndpoint(html, extracted.markdown);
  const codeBlocks = extractCodeBlocks(html);
  const tables = extractTables(html);
  const schemas = extractSchemas(html);
  const schemaBlocks = schemasToCodeBlocks(schemas);

  const type = determineDocumentType(endpoint, extracted.title, url);
  const tags = buildTags(domain, subcategory, type, endpoint);

  const markdown = extracted.markdown;
  const textContent = [extracted.title, extracted.description, markdown].filter(Boolean).join('\n');

  const base: SemanticDocument = {
    id: urlHash(url),
    title: extracted.title,
    domain,
    subcategory,
    storageSegments,
    type,
    url,
    content: textContent,
    markdown,
    description: extracted.description,
    headings: extracted.headings,
    tables,
    examples: codeBlocks.filter((b) => b.label?.toLowerCase().includes('example')),
    codeBlocks: [...codeBlocks, ...schemaBlocks].filter(
      (b) => !/loadingloading|^loading$/i.test(b.code.trim()),
    ),
    breadcrumbs,
    tags,
    endpoint,
    authRequired: endpoint?.authRequired,
    contentHash: contentHash(textContent),
    extractedAt: new Date().toISOString(),
    framework: extracted.framework,
  };

  return enrichDocument(base, { navItem, baseUrl });
}

function determineDocumentType(
  endpoint: ReturnType<typeof extractEndpoint>,
  title: string,
  url: string,
): SemanticDocument['type'] {
  if (endpoint) return 'endpoint';
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
