import * as cheerio from 'cheerio';
import type { CodeBlock } from '../types/document.js';
import { normalizeWhitespace } from '../utils/cleaner.js';

export interface ExtractedSchema {
  name: string;
  type: 'object' | 'array' | 'string' | 'unknown';
  properties: SchemaProperty[];
  raw: string;
}

export interface SchemaProperty {
  name: string;
  type?: string;
  required: boolean;
  description?: string;
  nested?: ExtractedSchema;
}

export function extractSchemas(html: string): ExtractedSchema[] {
  const $ = cheerio.load(html);
  const schemas: ExtractedSchema[] = [];

  $('pre code, pre').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw.startsWith('{') && !raw.startsWith('[')) return;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const name =
        $(el).prevAll('h2, h3, h4').first().text().trim() ||
        $(el).closest('[class*="schema"]').find('h3, h4').first().text().trim() ||
        'Schema';

      schemas.push({
        name: normalizeWhitespace(name) || 'Schema',
        type: Array.isArray(parsed) ? 'array' : 'object',
        properties: parseJsonSchema(parsed),
        raw,
      });
    } catch {
      // not valid JSON schema
    }
  });

  const tableSchemas = extractSchemasFromTables($);
  schemas.push(...tableSchemas);

  return schemas;
}

function parseJsonSchema(
  obj: Record<string, unknown>,
  depth = 0,
): SchemaProperty[] {
  if (depth > 5) return [];

  const properties: SchemaProperty[] = [];

  if (obj.properties && typeof obj.properties === 'object') {
    const required = Array.isArray(obj.required) ? (obj.required as string[]) : [];
    for (const [name, def] of Object.entries(obj.properties as Record<string, Record<string, unknown>>)) {
      properties.push({
        name,
        type: typeof def.type === 'string' ? def.type : undefined,
        required: required.includes(name),
        description: typeof def.description === 'string' ? def.description : undefined,
      });
    }
    return properties;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      properties.push({
        name: key,
        type: 'object',
        required: false,
        nested: {
          name: key,
          type: 'object',
          properties: parseJsonSchema(value as Record<string, unknown>, depth + 1),
          raw: JSON.stringify(value),
        },
      });
    } else {
      properties.push({
        name: key,
        type: typeof value,
        required: false,
      });
    }
  }

  return properties;
}

function extractSchemasFromTables($: cheerio.CheerioAPI): ExtractedSchema[] {
  const schemas: ExtractedSchema[] = [];

  $('table').each((_, table) => {
    const heading = $(table).prevAll('h2, h3').first().text().toLowerCase();
    if (!heading.includes('schema') && !heading.includes('model') && !heading.includes('object')) {
      return;
    }

    const properties: SchemaProperty[] = [];
    $(table)
      .find('tbody tr')
      .each((__, row) => {
        const cells = $(row).find('td').map((___, td) => normalizeWhitespace($(td).text())).get();
        if (cells.length >= 2) {
          properties.push({
            name: cells[0],
            type: cells[1],
            required: cells.length > 2 ? /yes|sim|true|required/i.test(cells[2]) : false,
            description: cells[3],
          });
        }
      });

    if (properties.length > 0) {
      schemas.push({
        name: normalizeWhitespace($(table).prevAll('h2, h3').first().text()) || 'TableSchema',
        type: 'object',
        properties,
        raw: JSON.stringify(properties),
      });
    }
  });

  return schemas;
}

export function schemasToCodeBlocks(schemas: ExtractedSchema[]): CodeBlock[] {
  return schemas.map((s) => ({
    language: 'json',
    code: s.raw,
    label: s.name,
    exampleType: 'schema' as const,
  }));
}
