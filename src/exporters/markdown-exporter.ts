import fs from 'fs-extra';
import type { SemanticDocument } from '../types/document.js';
import { assembleMarkdown, enrichMarkdownWithEndpoint } from '../parsers/markdown-parser.js';
import { filenameFromDocument } from '../parsers/domain-parser.js';
import { buildMarkdownPath } from '../utils/path-builder.js';
import { logger } from '../utils/logger.js';

export class MarkdownExporter {
  constructor(private readonly baseUrl = 'https://developers.dock.tech') {}

  async export(doc: SemanticDocument): Promise<string> {
    let markdown = assembleMarkdown(doc);

    if (doc.endpoint) {
      markdown = enrichMarkdownWithEndpoint(
        markdown,
        doc.endpoint,
      );
    }

    const filename = filenameFromDocument(doc, this.baseUrl);
    const filepath = buildMarkdownPath(doc.domain, filename, doc.storageSegments ?? []);

    await fs.outputFile(filepath, markdown, 'utf8');
    logger.debug(`Markdown exported: ${filepath}`);

    return filepath;
  }

  async exportAll(documents: SemanticDocument[]): Promise<string[]> {
    const paths: string[] = [];
    for (const doc of documents) {
      paths.push(await this.export(doc));
    }
    return paths;
  }
}
