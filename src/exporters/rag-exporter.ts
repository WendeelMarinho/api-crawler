import fs from 'fs-extra';
import path from 'node:path';
import type { SemanticChunk } from '../types/document.js';
import type { SemanticDocument } from '../types/document.js';
import { STORAGE_PATHS } from '../config/constants.js';
import { chunkDocument } from '../parsers/chunk-parser.js';
import { extractTextFromMarkdown } from '../utils/cleaner.js';
import { logger } from '../utils/logger.js';

export type RagTarget = 'chromadb' | 'qdrant' | 'generic';

export interface RagRecord {
  id: string;
  document: string;
  metadata: Record<string, string | number | boolean>;
  embedding_hint: string;
}

export interface ChromaExport {
  ids: string[];
  documents: string[];
  metadatas: Record<string, string | number | boolean>[];
  embedding_hints: string[];
}

export interface QdrantPoint {
  id: string;
  vector?: number[];
  payload: {
    content: string;
    domain: string;
    section: string;
    type: string;
    url: string;
    embedding_hint: string;
    document_id: string;
    [key: string]: string | number | boolean;
  };
}

export class RagExporter {
  async exportFromDocuments(
    documents: SemanticDocument[],
    target: RagTarget = 'generic',
  ): Promise<string> {
    const allChunks: SemanticChunk[] = [];
    for (const doc of documents) {
      allChunks.push(...chunkDocument(doc));
    }
    return this.exportChunks(allChunks, target);
  }

  async exportChunks(chunks: SemanticChunk[], target: RagTarget = 'generic'): Promise<string> {
    await fs.ensureDir(STORAGE_PATHS.embeddings);

    switch (target) {
      case 'chromadb':
        return this.exportChroma(chunks);
      case 'qdrant':
        return this.exportQdrant(chunks);
      default:
        return this.exportGeneric(chunks);
    }
  }

  private async exportGeneric(chunks: SemanticChunk[]): Promise<string> {
    const records: RagRecord[] = chunks.map((chunk) => ({
      id: chunk.id,
      document: chunk.content,
      metadata: {
        domain: chunk.domain,
        section: chunk.section,
        type: chunk.type,
        source_url: chunk.sourceUrl,
        document_id: chunk.documentId,
        ...chunk.metadata,
      },
      embedding_hint: chunk.embedding_hint,
    }));

    const filepath = path.join(STORAGE_PATHS.embeddings, 'rag-records.jsonl');
    const lines = records.map((r) => JSON.stringify(r)).join('\n');
    await fs.writeFile(filepath, lines, 'utf8');
    logger.info(`Generic RAG export: ${records.length} records → ${filepath}`);
    return filepath;
  }

  private async exportChroma(chunks: SemanticChunk[]): Promise<string> {
    const chroma: ChromaExport = {
      ids: [],
      documents: [],
      metadatas: [],
      embedding_hints: [],
    };

    for (const chunk of chunks) {
      chroma.ids.push(chunk.id);
      chroma.documents.push(chunk.content);
      chroma.embedding_hints.push(chunk.embedding_hint);
      chroma.metadatas.push({
        domain: chunk.domain,
        section: chunk.section,
        type: chunk.type,
        source_url: chunk.sourceUrl,
        document_id: chunk.documentId,
        embedding_hint: chunk.embedding_hint,
        ...chunk.metadata,
      });
    }

    const filepath = path.join(STORAGE_PATHS.embeddings, 'chromadb-import.json');
    await fs.writeJson(filepath, chroma, { spaces: 2 });

    const collectionMeta = {
      collection_name: 'dock_docs',
      embedding_model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
      record_count: chunks.length,
      import_instructions: [
        'pip install chromadb',
        'Use chromadb.HttpClient or PersistentClient',
        'collection.add(ids=..., documents=..., metadatas=...)',
        'Prepend embedding_hint to document for better retrieval',
      ],
    };

    await fs.writeJson(
      path.join(STORAGE_PATHS.embeddings, 'chromadb-meta.json'),
      collectionMeta,
      { spaces: 2 },
    );

    logger.info(`ChromaDB export: ${chunks.length} records → ${filepath}`);
    return filepath;
  }

  private async exportQdrant(chunks: SemanticChunk[]): Promise<string> {
    const points: QdrantPoint[] = chunks.map((chunk) => ({
      id: chunk.id,
      payload: {
        content: chunk.content,
        domain: chunk.domain,
        section: chunk.section,
        type: chunk.type,
        url: chunk.sourceUrl,
        embedding_hint: chunk.embedding_hint,
        document_id: chunk.documentId,
        ...Object.fromEntries(
          Object.entries(chunk.metadata).map(([k, v]) => [k, String(v)]),
        ),
      },
    }));

    const filepath = path.join(STORAGE_PATHS.embeddings, 'qdrant-points.json');
    const batch = {
      collection_name: 'dock_docs',
      vector_size: 1536,
      distance: 'Cosine',
      points,
      upsert_note: 'Generate vectors externally, then upsert with content + payload',
    };

    await fs.writeJson(filepath, batch, { spaces: 2 });

    const ndjsonPath = path.join(STORAGE_PATHS.embeddings, 'qdrant-points.ndjson');
    const ndjson = points.map((p) => JSON.stringify(p)).join('\n');
    await fs.writeFile(ndjsonPath, ndjson, 'utf8');

    logger.info(`Qdrant export: ${chunks.length} points → ${filepath}`);
    return filepath;
  }

  buildEmbeddingText(chunk: SemanticChunk): string {
    return `${chunk.embedding_hint}\n\n${chunk.content}`;
  }

  async exportDocumentsSummary(documents: SemanticDocument[]): Promise<string> {
    const summary = documents.map((d) => ({
      id: d.id,
      title: d.title,
      domain: d.domain,
      type: d.type,
      preview: extractTextFromMarkdown(d.markdown).slice(0, 200),
      embedding_text: `${d.domain}: ${d.title} - ${d.description ?? ''}`,
    }));

    const filepath = path.join(STORAGE_PATHS.embeddings, 'documents-summary.json');
    await fs.writeJson(filepath, summary, { spaces: 2 });
    return filepath;
  }
}
