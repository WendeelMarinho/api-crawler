import fs from 'fs-extra';
import path from 'node:path';
import { STORAGE_PATHS } from '../config/constants.js';
import { parsePage } from '../parsers/semantic-parser.js';
import { buildNavUrlIndex, resolveStorageLocation } from '../navigation/nav-path.js';
import type { FlatNavItem } from '../types/navigation.js';
import { JsonExporter } from '../exporters/json-exporter.js';
import { MarkdownExporter } from '../exporters/markdown-exporter.js';
import { urlHash } from '../utils/hash.js';
import { logger } from '../utils/logger.js';
import { getEmailNotifier } from '../notifications/email-notifier.js';

export interface RebuildResult {
  rebuilt: number;
  skipped: number;
  missingUrl: number;
}

async function loadFlatNav(): Promise<FlatNavItem[]> {
  const flatPath = `${STORAGE_PATHS.navigation}/navigation-flat.json`;
  if (await fs.pathExists(flatPath)) {
    return fs.readJson(flatPath);
  }
  return [];
}

export async function rebuildFromRawHtmlCache(
  baseUrl: string,
  options: { cleanOutput?: boolean; quietNotifications?: boolean } = {},
): Promise<RebuildResult> {
  const mail = getEmailNotifier();
  const startedAt = Date.now();
  const quiet = options.quietNotifications === true;

  try {
  if (options.cleanOutput !== false) {
    logger.info('Clearing json and markdown output before rebuild...');
    await fs.emptyDir(STORAGE_PATHS.json);
    await fs.emptyDir(STORAGE_PATHS.markdown);
    await fs.ensureDir(STORAGE_PATHS.json);
    await fs.ensureDir(STORAGE_PATHS.markdown);
  }

  const flatNav = await loadFlatNav();
  const navByUrl = buildNavUrlIndex(flatNav);
  const idToUrl = new Map<string, string>();

  for (const item of flatNav) {
    if (!item.url) continue;
    idToUrl.set(urlHash(item.url), item.url);
    idToUrl.set(item.url.replace(/\/$/, ''), item.url);
  }

  if (!options.cleanOutput && (await fs.pathExists(STORAGE_PATHS.json))) {
    await indexUrlsFromExistingJson(idToUrl);
  }

  const jsonExporter = new JsonExporter(baseUrl);
  const mdExporter = new MarkdownExporter(baseUrl);
  let rebuilt = 0;
  let skipped = 0;
  let missingUrl = 0;

  if (!(await fs.pathExists(STORAGE_PATHS.rawHtml))) {
    logger.warn('No raw-html cache found');
    return { rebuilt, skipped, missingUrl };
  }

  const domains = await fs.readdir(STORAGE_PATHS.rawHtml);
  let totalHtml = 0;
  for (const domain of domains) {
    const domainDir = path.join(STORAGE_PATHS.rawHtml, domain);
    if (!(await fs.stat(domainDir)).isDirectory()) continue;
    totalHtml += (await fs.readdir(domainDir)).filter((f) => f.endsWith('.html')).length;
  }

  if (!quiet) {
    await mail.notifyJobStarted('rebuild', { 'HTML em cache': totalHtml, Domínios: domains.length });
  }

  for (const domain of domains) {
    const domainDir = path.join(STORAGE_PATHS.rawHtml, domain);
    if (!(await fs.stat(domainDir)).isDirectory()) continue;

    const files = await fs.readdir(domainDir);
    for (const file of files) {
      if (!file.endsWith('.html')) continue;

      const docId = file.replace(/\.html$/, '');
      const url = idToUrl.get(docId);
      if (!url) {
        missingUrl++;
        continue;
      }

      const htmlPath = path.join(domainDir, file);
      const html = await fs.readFile(htmlPath, 'utf8');
      const normalized = url.replace(/\/$/, '');
      const navItem = navByUrl.get(normalized);

      const doc = parsePage({ url, html, baseUrl, navItem });
      const location = resolveStorageLocation(doc, navByUrl, baseUrl);

      const updated = {
        ...doc,
        domain: location.domain,
        subcategory: location.subcategory,
        storageSegments: location.segments,
        breadcrumbs: location.breadcrumbs.length > 0 ? location.breadcrumbs : doc.breadcrumbs,
      };

      await jsonExporter.export(updated);
      await mdExporter.export(updated);
      rebuilt++;

      if (totalHtml > 0 && !quiet) {
        await mail.notifyProgress('rebuild', rebuilt, totalHtml, {
          Reparseadas: rebuilt,
          Sem_URL: missingUrl,
        });
      }
    }
  }

  logger.info(`Rebuild complete: ${rebuilt} pages, ${missingUrl} without URL mapping`);
  const durationMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  if (!quiet) {
    await mail.notifyJobCompleted('rebuild', {
      Reparseadas: rebuilt,
      'Sem URL': missingUrl,
      'Duração (min)': durationMin,
    });
  }
  return { rebuilt, skipped, missingUrl };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!quiet) await mail.notifyJobFailed('rebuild', msg);
    throw error;
  }
}

async function indexUrlsFromExistingJson(idToUrl: Map<string, string>): Promise<void> {
  async function walk(dir: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
        try {
          const raw = (await fs.readJson(abs)) as { id?: string; url?: string };
          if (typeof raw.id === 'string' && typeof raw.url === 'string') {
            idToUrl.set(raw.id, raw.url);
            idToUrl.set(urlHash(raw.url), raw.url);
          }
        } catch {
          // skip
        }
      }
    }
  }
  await walk(STORAGE_PATHS.json);
}
