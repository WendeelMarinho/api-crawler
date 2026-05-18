import fs from 'fs-extra';
import type { SemanticDocument, SemanticChunk } from '../types/document.js';
import { filenameFromDocument } from '../parsers/domain-parser.js';
import { buildJsonPath, buildChunkPath } from '../utils/path-builder.js';
import { logger } from '../utils/logger.js';

export class JsonExporter {
  constructor(private readonly baseUrl = 'https://developers.dock.tech') {}

  async export(doc: SemanticDocument): Promise<string> {
    const payload: SemanticDocument = {
      id: doc.id,
      title: doc.title,
      domain: doc.domain,
      subcategory: doc.subcategory,
      type: doc.type,
      url: doc.url,
      content: doc.content,
      markdown: doc.markdown,
      description: doc.description,
      headings: doc.headings,
      tables: doc.tables,
      examples: doc.examples,
      codeBlocks: doc.codeBlocks,
      endpoint: doc.endpoint,
      tags: doc.tags,
      breadcrumbs: doc.breadcrumbs,
      contentHash: doc.contentHash,
      extractedAt: doc.extractedAt,
      framework: doc.framework,
      version: doc.version,
      authRequired: doc.authRequired,
      extractionQuality: doc.extractionQuality,
    };

    const filename = filenameFromDocument(doc, this.baseUrl).replace('.md', '.json');
    const filepath = buildJsonPath(doc.domain, filename, doc.storageSegments ?? []);

    await fs.outputJson(filepath, payload, { spaces: 2 });
    logger.debug(`JSON exported: ${filepath}`);

    return filepath;
  }

  async exportChunks(domain: string, chunks: SemanticChunk[]): Promise<void> {
    for (const chunk of chunks) {
      const filepath = buildChunkPath(domain, chunk.id);
      await fs.outputJson(filepath, chunk, { spaces: 2 });
    }
  }

  async exportIndex(documents: SemanticDocument[]): Promise<string> {
    const { STORAGE_PATHS } = await import('../config/constants.js');
    const indexPath = `${STORAGE_PATHS.json}/index.json`;
    const index = documents.map((d) => ({
      id: d.id,
      title: d.title,
      domain: d.domain,
      type: d.type,
      url: d.url,
      path: buildJsonPath(
        d.domain,
        filenameFromDocument(d, this.baseUrl).replace('.md', '.json'),
        d.storageSegments ?? [],
      ),
    }));
    await fs.outputJson(indexPath, index, { spaces: 2 });
    return indexPath;
  }
}
