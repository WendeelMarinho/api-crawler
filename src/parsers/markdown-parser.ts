import type { SemanticDocument } from '../types/document.js';
import type { EndpointDefinition } from '../types/endpoint.js';
import { extractTextFromMarkdown } from '../utils/cleaner.js';

export interface Frontmatter {
  domain: string;
  subcategory: string;
  title: string;
  type: string;
  method?: string;
  path?: string;
  auth_required?: boolean;
  version?: string;
  tags: string[];
  url?: string;
  id?: string;
}

export function buildFrontmatter(doc: SemanticDocument): string {
  const fm: Frontmatter = {
    domain: doc.domain,
    subcategory: doc.subcategory,
    title: doc.title,
    type: doc.type,
    method: doc.endpoint?.method,
    path: doc.endpoint?.path,
    auth_required: doc.authRequired ?? doc.endpoint?.authRequired,
    version: doc.version,
    tags: doc.tags,
    url: doc.url,
    id: doc.id,
  };

  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push('---', '');

  return lines.join('\n');
}

export function assembleMarkdown(doc: SemanticDocument): string {
  const frontmatter = buildFrontmatter(doc);
  return `${frontmatter}${doc.markdown}`;
}

export function parseFrontmatter(markdown: string): Frontmatter | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm: Partial<Frontmatter> = { tags: [] };
  const lines = match[1].split('\n');
  let currentArrayKey: string | null = null;

  for (const line of lines) {
    const arrayItem = line.match(/^\s+-\s+(.+)$/);
    if (arrayItem && currentArrayKey) {
      (fm[currentArrayKey as keyof Frontmatter] as string[]).push(
        arrayItem[1].replace(/^["']|["']$/g, ''),
      );
      continue;
    }

    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;

    const [, key, rawValue] = kv;
    currentArrayKey = rawValue === '' ? key : null;

    if (rawValue === '') continue;

    const value = rawValue.replace(/^["']|["']$/g, '');
    if (key === 'tags') {
      fm.tags = [value];
    } else if (key === 'auth_required') {
      fm.auth_required = value === 'true';
    } else {
      (fm as Record<string, unknown>)[key] = value;
    }
  }

  return fm as Frontmatter;
}

export function enrichMarkdownWithEndpoint(
  markdown: string,
  endpoint: EndpointDefinition,
): string {
  const methodBadge = `**${endpoint.method}** \`${endpoint.path}\``;
  if (markdown.includes(endpoint.path)) return markdown;
  return `${methodBadge}\n\n${markdown}`;
}

export function estimateTokens(text: string): number {
  return Math.ceil(extractTextFromMarkdown(text).split(/\s+/).length * 1.3);
}
