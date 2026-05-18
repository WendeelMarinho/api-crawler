import fs from 'fs-extra';
import pLimit from 'p-limit';
import type { BrowserContext, Response } from 'playwright';
import cliProgress from 'cli-progress';
import { AuthManager } from '../auth/auth-manager.js';
import { CrawlQueue } from './queue.js';
import {
  discoverLinksFromHtml,
  discoverLinksFromNav,
  discoverNavLinksFromHtml,
  discoverUncrawledNavUrls,
  shouldCrawlUrl,
  type CrawlDiscoverMode,
} from './discovery.js';
import { parseNavigationFromPage, expandCollapsedSidebar } from './navigation-parser.js';
import { extractSidebar } from '../extractors/sidebar-extractor.js';
import {
  domainTitleFromSlug,
  mergeFlatNav,
  mergeNavigationTree,
  wrapSidebarUnderDomain,
} from '../navigation/nav-merge.js';
import { resolveDomainFromUrl } from '../utils/slugify.js';
import { parsePage, inferArchitectureMap } from '../parsers/semantic-parser.js';
import { assignDocumentsToHierarchy, buildHierarchyMapping } from '../parsers/hierarchy-parser.js';
import { chunkDocument } from '../parsers/chunk-parser.js';
import { MarkdownExporter } from '../exporters/markdown-exporter.js';
import { JsonExporter } from '../exporters/json-exporter.js';
import { NavigationExporter } from '../exporters/navigation-exporter.js';
import { SummaryExporter } from '../exporters/summary-exporter.js';
import { isOpenApiUrl, saveOpenApiSpec } from '../extractors/openapi-extractor.js';
import { isGraphqlUrl, saveGraphqlPayload } from '../extractors/graphql-extractor.js';
import { STORAGE_PATHS } from '../config/constants.js';
import type { SemanticDocument } from '../types/document.js';
import type { CrawlDocumentMeta } from '../types/crawl-meta.js';
import type { FlatNavItem, NavigationTree } from '../types/navigation.js';
import type { ReadmeDomSnapshot } from '../types/readme-dom.js';
import { logger } from '../utils/logger.js';
import { withRetry, sleep } from '../utils/retry.js';
import { buildScreenshotPath, buildRawHtmlPath } from '../utils/path-builder.js';
import { getEmailNotifier } from '../notifications/email-notifier.js';
import { urlHash } from '../utils/hash.js';
import {
  collectTryItLanguageSamples,
  extractReadmeDomSnapshot,
  isDockReadmeReferencePage,
  prepareReadmeReferencePage,
  saveReadmeExtractionDebugArtifacts,
} from '../extractors/readme-dom-extractor.js';
import { computeDomExtractionAssertions } from '../extractors/readme-dom-assertions.js';

export interface CrawlerConfig {
  baseUrl: string;
  docsPath: string;
  concurrency: number;
  delayMs: number;
  maxRetries: number;
  timeoutMs: number;
  headless: boolean;
  manualTimeoutSec: number;
  resume?: boolean;
  username?: string;
  password?: string;
  discoverMode: CrawlDiscoverMode;
  maxPages: number;
  /** Write storage/debug-extraction/{id}/ (full.html, screenshot, per-section HTML/JSON, extraction-meta) */
  extractionDebugArtifacts?: boolean;
}

export class DockDocsCrawler {
  private queue: CrawlQueue = new CrawlQueue();
  private readonly documentMetas: CrawlDocumentMeta[] = [];
  private readonly contentHashes = new Set<string>();
  private readonly visitedUrls = new Set<string>();
  private navTree: NavigationTree = {};
  private flatNav: FlatNavItem[] = [];
  private readonly markdownExporter: MarkdownExporter;
  private readonly jsonExporter: JsonExporter;
  private readonly navExporter = new NavigationExporter();
  private readonly summaryExporter = new SummaryExporter();

  constructor(
    private readonly config: CrawlerConfig,
    private readonly authManager: AuthManager,
  ) {
    this.markdownExporter = new MarkdownExporter(config.baseUrl);
    this.jsonExporter = new JsonExporter(config.baseUrl);
  }

  async run(): Promise<void> {
    const mail = getEmailNotifier();
    const startedAt = Date.now();

    try {
    await fs.ensureDir(STORAGE_PATHS.rawHtml);
    await this.authManager.ensureAuthenticated();

    const context = await this.authManager.getContext();
    await this.setupInterception(context);
    const startUrl = new URL(this.config.docsPath, this.config.baseUrl).href;

    if (this.config.discoverMode === 'full') {
      logger.warn(
        'CRAWL_DISCOVER_MODE=full pode enfileirar milhares de páginas e consumir muita RAM — prefira "sidebar"',
      );
    }

    if (this.config.resume) {
      const restored = await CrawlQueue.load();
      if (restored) {
        this.queue = restored;
        await this.loadSavedNavigation();
        await this.loadExistingHashes();
        logger.info('Resuming crawl from saved queue state');
      }
    }

    if (this.queue.visitedCount === 0 && this.queue.size === 0) {
      await this.bootstrapNavigation(context, startUrl);
      const navUrls = discoverLinksFromNav(this.flatNav, this.config.baseUrl);
      this.queue.enqueueMany([startUrl, ...navUrls]);

      if (this.config.discoverMode === 'sidebar') {
        await this.expandQueueFromDomainRoots(context, navUrls);
      }

      const uncrawled = await discoverUncrawledNavUrls(this.flatNav, this.config.baseUrl);
      if (uncrawled.length > 0) {
        const added = this.queue.enqueueMany(uncrawled);
        logger.info(`Enqueued ${added} URLs from navigation not yet in raw-html cache`);
      }
    } else if (this.flatNav.length > 0) {
      this.queue.enqueueMany(discoverLinksFromNav(this.flatNav, this.config.baseUrl));
      const uncrawled = await discoverUncrawledNavUrls(this.flatNav, this.config.baseUrl);
      if (uncrawled.length > 0) {
        this.queue.enqueueMany(uncrawled);
      }
    }

    const initialSize = this.queue.size;
    logger.info(`Crawl queue: ${initialSize} URLs (mode=${this.config.discoverMode})`);

    await mail.notifyJobStarted('crawl', {
      Fila: initialSize,
      Modo: this.config.discoverMode,
      Concorrência: this.config.concurrency,
    });

    const progressBar = new cliProgress.SingleBar(
      {
        format:
          'Crawl |{bar}| {percentage}% | {value}/{total} | saved:{saved} | {url}',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(initialSize, 0, { url: 'starting...', saved: 0 });

    const limit = pLimit(this.config.concurrency);
    let processed = 0;

    while (this.queue.size > 0) {
      if (this.isMaxPagesReached()) {
        logger.info(`CRAWL_MAX_PAGES (${this.config.maxPages}) reached — stopping`);
        break;
      }

      const batch: string[] = [];
      while (batch.length < this.config.concurrency && this.queue.size > 0) {
        const url = this.queue.dequeue();
        if (url) batch.push(url);
      }

      await Promise.all(
        batch.map((url) =>
          limit(async () => {
            try {
              const saved = await this.crawlPage(context, url);
              processed++;
              progressBar.update(processed, {
                url: url.slice(0, 55),
                saved: this.documentMetas.length,
              });
              const totalEst = Math.max(processed + this.queue.size, initialSize);
              await mail.notifyProgress(
                'crawl',
                processed,
                totalEst,
                { Salvas: this.documentMetas.length, Falhas: this.queue.failedUrls.size },
                url,
              );
              if (saved && processed > initialSize) {
                progressBar.setTotal(processed + this.queue.size);
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : String(error);
              this.queue.markFailed(url, msg);
              logger.error(`Failed to crawl ${url}: ${msg}`);
            }
            await sleep(this.config.delayMs);
          }),
        ),
      );

      await this.queue.persist();
    }

    progressBar.stop();
    await fs.remove(`${STORAGE_PATHS.navigation}/crawl-queue.json`).catch(() => undefined);

    await this.navExporter.exportTree(this.navTree);
    await this.navExporter.exportFlat(this.flatNav);

    const lightDocs = this.buildLightDocumentsForGraph();
    const mapping = buildHierarchyMapping(this.flatNav);
    const orderedDocs = assignDocumentsToHierarchy(lightDocs, mapping);
    const architectureMap =
      lightDocs.length <= 2000 ? inferArchitectureMap(orderedDocs) : {};
    if (lightDocs.length > 2000) {
      logger.warn('Architecture map skipped — too many pages for in-memory graph');
    }
    await this.navExporter.exportArchitectureMap(architectureMap);

    await this.summaryExporter.export({
      documents: orderedDocs,
      navTree: this.navTree,
      flatNav: this.flatNav,
      visited: this.queue.visitedCount,
      failed: this.queue.failedUrls.size,
      interceptedApis: 0,
    });

    logger.info('Crawl completed', {
      saved: this.documentMetas.length,
      visited: this.queue.visitedCount,
      failed: this.queue.failedUrls.size,
      domains: Object.keys(this.navTree).length,
    });

    const durationMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
    await mail.notifyJobCompleted('crawl', {
      Salvas: this.documentMetas.length,
      Visitadas: this.queue.visitedCount,
      Falhas: this.queue.failedUrls.size,
      'Duração (min)': durationMin,
    });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await mail.notifyJobFailed('crawl', msg);
      throw error;
    }
  }

  private isMaxPagesReached(): boolean {
    return this.config.maxPages > 0 && this.documentMetas.length >= this.config.maxPages;
  }

  private async loadExistingHashes(): Promise<void> {
    if (!(await fs.pathExists(STORAGE_PATHS.json))) return;

    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const abs = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
          try {
            const raw = (await fs.readJson(abs)) as {
              contentHash?: string;
              url?: string;
            };
            if (raw.contentHash) this.contentHashes.add(raw.contentHash);
            if (raw.url) this.visitedUrls.add(raw.url.replace(/\/$/, ''));
          } catch {
            // skip corrupt file
          }
        }
      }
    };

    await walk(STORAGE_PATHS.json);
    logger.info(
      `Resume: ${this.contentHashes.size} content hashes, ${this.visitedUrls.size} URLs loaded`,
    );
  }

  private async loadSavedNavigation(): Promise<void> {
    const treePath = `${STORAGE_PATHS.navigation}/navigation-tree.json`;
    const flatPath = `${STORAGE_PATHS.navigation}/navigation-flat.json`;

    if (await fs.pathExists(treePath)) {
      this.navTree = await fs.readJson(treePath);
    }
    if (await fs.pathExists(flatPath)) {
      this.flatNav = await fs.readJson(flatPath);
    }
  }

  private async expandQueueFromDomainRoots(
    context: BrowserContext,
    navUrls: string[],
  ): Promise<void> {
    const roots = navUrls.filter((u) => /\/reference\/?$/i.test(new URL(u).pathname));
    logger.info(`Expanding sidebar from ${roots.length} domain roots`);

    for (const rootUrl of roots) {
      const page = await context.newPage();
      try {
        await page.goto(rootUrl, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeoutMs,
        });
        await expandCollapsedSidebar(page);
        const html = await page.content();
        const links = discoverNavLinksFromHtml(html, rootUrl, this.config.baseUrl);
        const added = this.queue.enqueueMany(links);

        const domainSlug = resolveDomainFromUrl(rootUrl, this.config.baseUrl);
        const { tree: sidebarTree, flat: sidebarFlat } = extractSidebar(html, this.config.baseUrl);
        const wrapped = wrapSidebarUnderDomain(
          domainSlug,
          domainTitleFromSlug(domainSlug),
          rootUrl,
          sidebarTree,
        );
        mergeNavigationTree(this.navTree, wrapped);
        const reassigned = sidebarFlat.map((item) => ({
          ...item,
          domain: domainSlug,
          navPath: [domainSlug, ...(item.navPath ?? [item.slug])],
          pathTitles: [domainTitleFromSlug(domainSlug), ...(item.pathTitles ?? [item.title])],
        }));
        mergeFlatNav(this.flatNav, reassigned);

        if (added > 0) {
          logger.info(`+${added} URLs from ${rootUrl} (nav +${reassigned.length})`);
        }
      } catch (error) {
        logger.warn(`Could not expand sidebar for ${rootUrl}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await page.close();
      }
    }
  }

  private async bootstrapNavigation(
    context: BrowserContext,
    startUrl: string,
  ): Promise<void> {
    const page = await context.newPage();
    try {
      await page.goto(startUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeoutMs,
      });
      await expandCollapsedSidebar(page);
      const nav = await parseNavigationFromPage(page, this.config.baseUrl);
      this.navTree = nav.tree;
      this.flatNav = nav.flat;

      const extra = discoverNavLinksFromHtml(
        await page.content(),
        startUrl,
        this.config.baseUrl,
      );
      for (const url of extra) {
        if (!this.flatNav.some((n) => n.url?.replace(/\/$/, '') === url.replace(/\/$/, ''))) {
          try {
            const parsed = new URL(url);
            const domain = parsed.pathname.split('/').filter(Boolean)[0] ?? 'general';
            this.flatNav.push({
              title: url,
              slug: url,
              url,
              domain,
              depth: 1,
              order: this.flatNav.length,
            });
          } catch {
            // skip
          }
        }
      }
    } finally {
      await page.close();
    }
  }

  /** Returns true if a new document was saved. */
  private async crawlPage(context: BrowserContext, url: string): Promise<boolean> {
    const normalized = url.replace(/\/$/, '');
    if (this.visitedUrls.has(normalized) || !shouldCrawlUrl(url, this.config.baseUrl)) {
      return false;
    }

    if (this.queue.isVisited(url)) {
      return false;
    }

    const page = await context.newPage();

    try {
      let readmeDomSnapshot: ReadmeDomSnapshot | undefined;

      const html = await withRetry(
        async () => {
          const useDomPipeline = isDockReadmeReferencePage(url, this.config.baseUrl);
          const waitUntil = useDomPipeline ? 'networkidle' : 'domcontentloaded';
          const navTimeout = useDomPipeline
            ? Math.min(this.config.timeoutMs, 120_000)
            : this.config.timeoutMs;

          const response = await page.goto(url, {
            waitUntil,
            timeout: navTimeout,
          });

          if (!response || response.status() >= 400) {
            throw new Error(`HTTP ${response?.status() ?? 'unknown'} for ${url}`);
          }

          if (useDomPipeline) {
            const t0 = Date.now();
            await prepareReadmeReferencePage(page, {
              delayMs: this.config.delayMs,
              timeoutMs: this.config.timeoutMs,
            });
            const dom = await extractReadmeDomSnapshot(page);
            dom.tryItSamples = await collectTryItLanguageSamples(page);
            dom.domAssertionViolations = computeDomExtractionAssertions(dom);
            const metrics = await page.evaluate(() => ({
              referenceMainNodeCount:
                document.querySelector('.rm-ReferenceMain')?.getElementsByTagName('*').length ?? 0,
              tablistCount: document.querySelectorAll('.rm-ReferenceMain [role="tablist"]').length,
            }));
            dom.captureMeta = {
              extractDurationMs: Date.now() - t0,
              referenceMainNodeCount: metrics.referenceMainNodeCount,
              tablistCount: metrics.tablistCount,
            };
            readmeDomSnapshot = dom;
            await saveReadmeExtractionDebugArtifacts(
              page,
              urlHash(url),
              dom,
              this.config.extractionDebugArtifacts === true,
            );
          } else {
            await this.waitForReadMeContent(page);
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight / 3)');
            await page.waitForTimeout(800);
            await page.evaluate('window.scrollTo(0, 0)');
            await page.waitForTimeout(400);
          }

          return page.content();
        },
        {
          maxAttempts: this.config.maxRetries,
          delayMs: 2000,
          onRetry: (attempt) => logger.warn(`Retry ${attempt} for ${url}`),
        },
      );

      if (readmeDomSnapshot?.captureMeta) {
        readmeDomSnapshot.captureMeta.fullHtmlBytes = html.length;
      }

      this.queue.markVisited(url);
      this.visitedUrls.add(normalized);

      const navItem = this.flatNav.find(
        (n) => n.url && n.url.replace(/\/$/, '') === normalized,
      );

      const doc = parsePage({
        url,
        html,
        baseUrl: this.config.baseUrl,
        navItem,
        readmeDom: readmeDomSnapshot,
      });

      if (this.contentHashes.has(doc.contentHash)) {
        logger.debug(`Duplicate content skipped: ${url}`);
        return false;
      }
      this.contentHashes.add(doc.contentHash);

      await fs.outputFile(buildRawHtmlPath(doc.domain, doc.id), html);

      await this.markdownExporter.export(doc);
      await this.jsonExporter.export(doc);
      const chunks = chunkDocument(doc);
      await this.jsonExporter.exportChunks(doc.domain, chunks);

      this.documentMetas.push({
        id: doc.id,
        url: doc.url,
        domain: doc.domain,
        title: doc.title,
        type: doc.type,
        contentHash: doc.contentHash,
      });

      if (this.config.discoverMode === 'full' && !this.isMaxPagesReached()) {
        const newLinks = discoverLinksFromHtml(
          html,
          url,
          this.config.baseUrl,
          doc.framework,
          'full',
        );
        this.queue.enqueueMany(newLinks);
      } else if (this.config.discoverMode === 'sidebar') {
        const navLinks = discoverNavLinksFromHtml(html, url, this.config.baseUrl);
        this.queue.enqueueMany(navLinks);
      }

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const screenshotPath = buildScreenshotPath(url);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      logger.error(`Page error ${url}`, { error: msg, screenshot: screenshotPath });
      throw error;
    } finally {
      await page.close();
    }
  }

  private buildLightDocumentsForGraph(): SemanticDocument[] {
    return this.documentMetas.map((m) => ({
      id: m.id,
      title: m.title,
      domain: m.domain,
      subcategory: m.domain,
      type: m.type as SemanticDocument['type'],
      url: m.url,
      content: m.title,
      markdown: '',
      headings: [],
      tables: [],
      examples: [],
      codeBlocks: [],
      breadcrumbs: [],
      tags: [m.domain],
      contentHash: m.contentHash,
      extractedAt: new Date().toISOString(),
    }));
  }

  /** Wait for ReadMe param blocks to finish lazy-loading (no placeholder text). */
  private async waitForReadMeContent(page: import('playwright').Page): Promise<void> {
    const settleMs = Math.min(Math.max(this.config.delayMs * 5, 2000), 5000);
    await page.waitForTimeout(settleMs);

    await page
      .waitForFunction(
        `() => {
          const containers = document.querySelectorAll(
            '.rm-ParamContainer, [class*="ParamContainer"], [data-testid*="param"]'
          );
          if (containers.length === 0) return true;
          for (const el of containers) {
            const text = (el.textContent || '').toLowerCase();
            if (
              text.includes('retrieving') ||
              text.includes('loadingloading') ||
              /\\bloading\\b/.test(text)
            ) return false;
          }
          return true;
        }`,
        { timeout: Math.min(this.config.timeoutMs, 15_000) },
      )
      .catch(() => undefined);
  }

  private async setupInterception(context: BrowserContext): Promise<void> {
    context.on('response', async (response) => {
      try {
        await this.interceptResponse(response);
      } catch {
        // non-fatal
      }
    });
    await context.route('**/*', async (route) => {
      await route.continue();
    });
  }

  private async interceptResponse(response: Response): Promise<void> {
    const url = response.url();
    if (!isOpenApiUrl(url) && !isGraphqlUrl(url)) return;

    const headers = response.headers();
    let responseBody: string | undefined;
    try {
      responseBody = await response.text();
    } catch {
      return;
    }

    if (isOpenApiUrl(url) && responseBody) {
      await saveOpenApiSpec(url, responseBody, headers);
      return;
    }

    if (isGraphqlUrl(url)) {
      const requestBody = response.request().postData() ?? undefined;
      if (requestBody) {
        await saveGraphqlPayload(url, requestBody, responseBody, headers);
      }
    }
  }
}
