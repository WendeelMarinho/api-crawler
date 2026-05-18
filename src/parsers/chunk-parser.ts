import type { SemanticDocument, SemanticChunk } from '../types/document.js';
import type { EndpointDefinition } from '../types/endpoint.js';
import { extractTextFromMarkdown, normalizeWhitespace } from '../utils/cleaner.js';
import { estimateTokens } from './markdown-parser.js';
import { contentHash } from '../utils/hash.js';
import { slugify } from '../utils/slugify.js';

const DEFAULT_MAX_TOKENS = parseInt(process.env.CHUNK_MAX_TOKENS ?? '512', 10);

export function chunkDocument(
  doc: SemanticDocument,
  maxTokens = DEFAULT_MAX_TOKENS,
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];

  if (doc.endpoint) {
    chunks.push(...chunkEndpoint(doc, doc.endpoint));
  }

  if (doc.headings.length > 0) {
    chunks.push(...chunkBySections(doc, maxTokens));
  } else {
    chunks.push(...chunkBySize(doc, maxTokens));
  }

  for (const table of doc.tables) {
    const tableContent = [
      `Table: ${table.caption ?? 'Parameters'}`,
      `| ${table.headers.join(' | ')} |`,
      ...table.rows.map((r) => `| ${r.join(' | ')} |`),
    ].join('\n');

    chunks.push(createChunk(doc, `table-${slugify(table.caption ?? 'data')}`, tableContent, {
      chunkType: 'table',
    }));
  }

  const deduped = deduplicateChunks(chunks);
  return deduped;
}

function chunkEndpoint(doc: SemanticDocument, endpoint: EndpointDefinition): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];

  const overview = [
    `# ${doc.title}`,
    `**${endpoint.method}** \`${endpoint.path}\``,
    endpoint.summary ?? doc.description ?? '',
    endpoint.description ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');

  chunks.push(
    createChunk(doc, 'endpoint-overview', overview, {
      chunkType: 'endpoint',
      embeddingHint: `${endpoint.method} ${endpoint.path}`,
    }),
  );

  if (endpoint.queryParams.length > 0 || endpoint.pathParams.length > 0) {
    const params = [...endpoint.pathParams, ...endpoint.queryParams, ...endpoint.bodyParams];
    const paramText = params
      .map((p) => `- **${p.name}** (${p.type ?? 'string'}, ${p.in}${p.required ? ', required' : ''}): ${p.description ?? ''}`)
      .join('\n');

    chunks.push(
      createChunk(doc, 'endpoint-params', `## Parameters\n\n${paramText}`, {
        chunkType: 'parameters',
        embeddingHint: `${endpoint.method} ${endpoint.path} parameters`,
      }),
    );
  }

  if (endpoint.examples.length > 0) {
    for (const [i, example] of endpoint.examples.entries()) {
      chunks.push(
        createChunk(doc, `endpoint-example-${i}`, `\`\`\`${example.language}\n${example.code}\n\`\`\``, {
          chunkType: 'example',
          embeddingHint: `${endpoint.method} ${endpoint.path} example`,
        }),
      );
    }
  }

  if (endpoint.responses.length > 0) {
    const responseText = endpoint.responses
      .map((r) => `### ${r.statusCode}\n${r.description ?? ''}\n${r.example ?? ''}`)
      .join('\n\n');

    chunks.push(
      createChunk(doc, 'endpoint-responses', responseText, {
        chunkType: 'response',
        embeddingHint: `${endpoint.method} ${endpoint.path} responses`,
      }),
    );
  }

  return chunks;
}

function chunkBySections(doc: SemanticDocument, maxTokens: number): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  const lines = doc.markdown.split('\n');
  let currentSection = 'introduction';
  let buffer: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (buffer.length > 0) {
        const content = buffer.join('\n');
        if (estimateTokens(content) > 0) {
          chunks.push(...splitIfNeeded(doc, currentSection, content, maxTokens));
        }
      }
      currentSection = slugify(headingMatch[2]);
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  if (buffer.length > 0) {
    const content = buffer.join('\n');
    chunks.push(...splitIfNeeded(doc, currentSection, content, maxTokens));
  }

  return chunks;
}

function chunkBySize(doc: SemanticDocument, maxTokens: number): SemanticChunk[] {
  const text = extractTextFromMarkdown(doc.markdown);
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);
  const chunks: SemanticChunk[] = [];
  let buffer = '';
  let sectionIdx = 0;

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (estimateTokens(candidate) > maxTokens && buffer) {
      chunks.push(
        createChunk(doc, `section-${sectionIdx++}`, buffer, {
          chunkType: 'content',
        }),
      );
      buffer = para;
    } else {
      buffer = candidate;
    }
  }

  if (buffer) {
    chunks.push(
      createChunk(doc, `section-${sectionIdx}`, buffer, {
        chunkType: 'content',
      }),
    );
  }

  return chunks;
}

function splitIfNeeded(
  doc: SemanticDocument,
  section: string,
  content: string,
  maxTokens: number,
): SemanticChunk[] {
  if (estimateTokens(content) <= maxTokens) {
    return [createChunk(doc, section, content, { chunkType: 'section' })];
  }

  return chunkBySize(
    { ...doc, markdown: content },
    maxTokens,
  ).map((c) => ({ ...c, section: `${section}-${c.section}` }));
}

function createChunk(
  doc: SemanticDocument,
  section: string,
  content: string,
  opts: { chunkType: string; embeddingHint?: string },
): SemanticChunk {
  const normalized = normalizeWhitespace(content);
  const hint =
    opts.embeddingHint ??
    (doc.endpoint ? `${doc.endpoint.method} ${doc.endpoint.path}` : `${doc.domain} ${doc.title}`);

  return {
    id: contentHash(`${doc.id}-${section}-${normalized.slice(0, 50)}`),
    domain: doc.domain,
    section,
    type: doc.type,
    embedding_hint: hint,
    content: normalized,
    metadata: {
      chunkType: opts.chunkType,
      title: doc.title,
      url: doc.url,
      method: doc.endpoint?.method ?? '',
      path: doc.endpoint?.path ?? '',
    },
    sourceUrl: doc.url,
    documentId: doc.id,
  };
}

function deduplicateChunks(chunks: SemanticChunk[]): SemanticChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = contentHash(c.content);
    if (seen.has(key)) return false;
    seen.add(key);
    return c.content.length >= 30;
  });
}
