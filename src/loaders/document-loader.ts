import fs from 'fs-extra';
import path from 'node:path';
import { STORAGE_PATHS } from '../config/constants.js';
import { validateSemanticDocument } from '../config/schemas.js';
import { logger } from '../utils/logger.js';
import type { SemanticDocument } from '../types/document.js';

const ID_SUFFIX_RE = /-([a-f0-9]{12})\.json$/i;

/** Legacy JSON on disk omitted id/markdown — recover from filename + markdown export. */
export function extractIdFromJsonFilename(filename: string): string | undefined {
  const match = filename.match(ID_SUFFIX_RE);
  return match?.[1];
}

export function hydrateStoredDocument(
  raw: Record<string, unknown>,
  options: { filename: string; markdown?: string },
): Record<string, unknown> {
  const id =
    typeof raw.id === 'string' && raw.id.length > 0
      ? raw.id
      : extractIdFromJsonFilename(options.filename);

  const markdown =
    typeof raw.markdown === 'string'
      ? raw.markdown
      : (options.markdown ?? '');

  return {
    ...raw,
    id: id ?? raw.contentHash ?? 'unknown',
    markdown,
  };
}

async function walkJsonFiles(
  dir: string,
  domainHint: string | undefined,
  onFile: (domain: string, filePath: string, filename: string) => Promise<void>,
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nextDomain = dir === STORAGE_PATHS.json ? entry.name : domainHint;
      await walkJsonFiles(abs, nextDomain, onFile);
    } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
      const domain =
        domainHint ?? path.relative(STORAGE_PATHS.json, dir).split(path.sep)[0] ?? 'general';
      await onFile(domain, abs, entry.name);
    }
  }
}

export async function loadAllDocuments(): Promise<SemanticDocument[]> {
  const documents: SemanticDocument[] = [];
  let skipped = 0;
  let hydrated = 0;

  if (!(await fs.pathExists(STORAGE_PATHS.json))) {
    return documents;
  }

  await walkJsonFiles(STORAGE_PATHS.json, undefined, async (domain, filePath, file) => {
    const raw = (await fs.readJson(filePath)) as Record<string, unknown>;
    const needsHydration = typeof raw.id !== 'string' || typeof raw.markdown !== 'string';

    const relDir = path.relative(path.join(STORAGE_PATHS.json, domain), path.dirname(filePath));
    const mdDir =
      relDir && relDir !== '.'
        ? path.join(STORAGE_PATHS.markdown, domain, relDir)
        : path.join(STORAGE_PATHS.markdown, domain);
    const mdPath = path.join(mdDir, file.replace(/\.json$/, '.md'));
    const markdown = needsHydration && (await fs.pathExists(mdPath))
      ? await fs.readFile(mdPath, 'utf8')
      : undefined;
    if (needsHydration) hydrated++;

    const normalized = hydrateStoredDocument(raw, { filename: file, markdown });
    const result = validateSemanticDocument(normalized);

    if (result.success) {
      documents.push(result.data as SemanticDocument);
    } else {
      skipped++;
      if (skipped <= 3) {
        const fields = result.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        logger.warn(`Invalid document ${domain}/${file}: ${fields}`);
      }
    }
  });

  if (skipped > 3) {
    logger.warn(`Skipped ${skipped} invalid document JSON file(s)`);
  }
  if (hydrated > 0 && documents.length > 0) {
    logger.info(
      `Loaded ${documents.length} documents (${hydrated} hydrated from markdown exports)`,
    );
  }

  return documents;
}
