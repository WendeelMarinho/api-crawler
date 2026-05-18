import fs from 'fs-extra';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import { STORAGE_PATHS } from '../config/constants.js';
import { hydrateStoredDocument } from '../loaders/document-loader.js';
import { validateSemanticDocument } from '../config/schemas.js';
import {
  discoverDomainsFromStoredUrls,
  harvestNavigationFromDomains,
} from '../navigation/nav-harvester.js';
import { filenameFromDocument } from '../parsers/domain-parser.js';
import { buildNavUrlIndex, resolveStorageLocation } from '../navigation/nav-path.js';
import { NavigationExporter } from '../exporters/navigation-exporter.js';
import { JsonExporter } from '../exporters/json-exporter.js';
import { MarkdownExporter } from '../exporters/markdown-exporter.js';
import type { SemanticDocument } from '../types/document.js';
import { logger } from '../utils/logger.js';
import { getEmailNotifier } from '../notifications/email-notifier.js';

export interface ReorganizeOptions {
  baseUrl: string;
  timeoutMs: number;
  skipNavHarvest?: boolean;
  dryRun?: boolean;
  quietNotifications?: boolean;
}

export interface ReorganizeResult {
  moved: number;
  unchanged: number;
  skipped: number;
  navItems: number;
  domains: number;
}

interface StoredFile {
  absPath: string;
  domain: string;
  filename: string;
}

async function collectJsonFiles(): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  if (!(await fs.pathExists(STORAGE_PATHS.json))) return files;

  async function walk(dir: string, domainHint?: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nextDomain =
          dir === STORAGE_PATHS.json ? entry.name : domainHint;
        await walk(abs, nextDomain);
      } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
        const domain =
          domainHint ??
          path.relative(STORAGE_PATHS.json, dir).split(path.sep)[0] ??
          'general';
        files.push({ absPath: abs, domain, filename: entry.name });
      }
    }
  }

  await walk(STORAGE_PATHS.json);
  return files;
}

async function loadDocumentFromFile(file: StoredFile): Promise<SemanticDocument | null> {
  const raw = (await fs.readJson(file.absPath)) as Record<string, unknown>;
  const relFromMd = path.relative(STORAGE_PATHS.markdown, path.dirname(file.absPath));
  const mdPath = path.join(STORAGE_PATHS.markdown, relFromMd, file.filename.replace(/\.json$/, '.md'));
  const markdown = (await fs.pathExists(mdPath))
    ? await fs.readFile(mdPath, 'utf8')
    : undefined;

  const normalized = hydrateStoredDocument(raw, {
    filename: file.filename,
    markdown,
  });
  const result = validateSemanticDocument(normalized);
  if (!result.success) {
    return null;
  }
  return result.data as SemanticDocument;
}

export async function reorganizeStorage(
  context: BrowserContext | null,
  options: ReorganizeOptions,
): Promise<ReorganizeResult> {
  const mail = getEmailNotifier();
  const startedAt = Date.now();
  const quiet = options.quietNotifications === true;

  try {
  const storedFiles = await collectJsonFiles();
  if (!quiet) {
    await mail.notifyJobStarted('reorganize', {
      Arquivos: storedFiles.length,
      'Dry-run': options.dryRun ? 'sim' : 'não',
    });
  }
  logger.info(`Found ${storedFiles.length} JSON files to reorganize`);

  const documents: SemanticDocument[] = [];
  const fileByUrl = new Map<string, StoredFile>();
  let skipped = 0;

  for (const file of storedFiles) {
    const doc = await loadDocumentFromFile(file);
    if (doc) {
      documents.push(doc);
      fileByUrl.set(doc.url.replace(/\/$/, ''), file);
    } else {
      skipped++;
    }
  }

  const urls = documents.map((d) => d.url);
  const domainSlugs = discoverDomainsFromStoredUrls(urls, options.baseUrl);
  logger.info(`Domains to harvest: ${domainSlugs.join(', ')}`);

  let navByUrl = buildNavUrlIndex([]);

  if (!options.skipNavHarvest && context) {
    const harvested = await harvestNavigationFromDomains(context, {
      baseUrl: options.baseUrl,
      domainSlugs,
      timeoutMs: options.timeoutMs,
    });
    navByUrl = buildNavUrlIndex(harvested.flat);

    if (!options.dryRun) {
      const navExporter = new NavigationExporter();
      await navExporter.exportTree(harvested.tree);
      await navExporter.exportFlat(harvested.flat);
    }
  } else {
    const flatPath = `${STORAGE_PATHS.navigation}/navigation-flat.json`;
    if (await fs.pathExists(flatPath)) {
      const flat = await fs.readJson(flatPath);
      navByUrl = buildNavUrlIndex(flat);
    }
  }

  const jsonExporter = new JsonExporter(options.baseUrl);
  const mdExporter = new MarkdownExporter(options.baseUrl);
  const usedPaths = new Set<string>();
  let moved = 0;
  let unchanged = 0;

  for (const doc of documents) {
    const location = resolveStorageLocation(doc, navByUrl, options.baseUrl);

    const updated: SemanticDocument = {
      ...doc,
      domain: location.domain,
      subcategory: location.subcategory,
      storageSegments: location.segments,
      breadcrumbs: location.breadcrumbs.length > 0 ? location.breadcrumbs : doc.breadcrumbs,
    };

    const filename = filenameFromDocument(updated, options.baseUrl).replace(/\.md$/, '.json');
    const targetJson = path.join(
      STORAGE_PATHS.json,
      location.domain,
      ...location.segments,
      filename,
    );

    if (usedPaths.has(targetJson)) {
      logger.warn(`Duplicate target path (skipped delete): ${targetJson}`);
      skipped++;
      continue;
    }
    usedPaths.add(targetJson);

    const targetMd = targetJson
      .replace(STORAGE_PATHS.json, STORAGE_PATHS.markdown)
      .replace(/\.json$/, '.md');

    const sourceFile = fileByUrl.get(doc.url.replace(/\/$/, ''));
    const sourceJson = sourceFile?.absPath;

    if (sourceJson && path.resolve(sourceJson) === path.resolve(targetJson)) {
      unchanged++;
      continue;
    }

    if (options.dryRun) {
      moved++;
      continue;
    }

    await fs.ensureDir(path.dirname(targetJson));
    await jsonExporter.export(updated);

    if (await fs.pathExists(targetMd.replace(path.basename(targetMd), path.basename(sourceFile?.filename.replace('.json', '.md') ?? '')))) {
      // markdown will be re-exported below
    }

    const oldMdSibling = sourceFile
      ? path.join(
          path.dirname(sourceFile.absPath).replace(STORAGE_PATHS.json, STORAGE_PATHS.markdown),
          sourceFile.filename.replace(/\.json$/, '.md'),
        )
      : null;

    await mdExporter.export(updated);

    if (sourceJson && path.resolve(sourceJson) !== path.resolve(targetJson)) {
      await fs.remove(sourceJson).catch(() => undefined);
    }
    if (oldMdSibling && (await fs.pathExists(oldMdSibling)) && path.resolve(oldMdSibling) !== path.resolve(targetMd)) {
      await fs.remove(oldMdSibling).catch(() => undefined);
    }

    moved++;
  }

  if (!options.dryRun) {
    await cleanupEmptyDirs(STORAGE_PATHS.json);
    await cleanupEmptyDirs(STORAGE_PATHS.markdown);
    await jsonExporter.exportIndex(documents);
  }

  const result = {
    moved,
    unchanged,
    skipped,
    navItems: navByUrl.size,
    domains: domainSlugs.length,
  };

  if (!quiet) {
    await mail.notifyJobCompleted('reorganize', {
      Movidos: moved,
      Inalterados: unchanged,
      Ignorados: skipped,
      'Nav itens': navByUrl.size,
      'Duração (min)': ((Date.now() - startedAt) / 60_000).toFixed(1),
    });
  }

  return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!quiet) await mail.notifyJobFailed('reorganize', msg);
    throw error;
  }
}

async function cleanupEmptyDirs(root: string): Promise<void> {
  if (!(await fs.pathExists(root))) return;

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const abs = path.join(root, entry.name);
    await cleanupEmptyDirs(abs);
    const remaining = await fs.readdir(abs);
    if (remaining.length === 0) {
      await fs.remove(abs);
    }
  }
}
