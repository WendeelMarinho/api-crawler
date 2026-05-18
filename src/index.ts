#!/usr/bin/env node
import { config } from 'dotenv';
config();
import { Command } from 'commander';
import fs from 'fs-extra';
import ora from 'ora';
import { AuthManager } from './auth/auth-manager.js';
import { BrowserLaunchError } from './auth/browser.js';
import { performLogin } from './auth/login.js';
import { clearSession } from './auth/session.js';
import {
  getDefaultGatewayIp,
  getWindowsHostIp,
  isWsl,
  printCdpDiagnostics,
  wslLoginHints,
} from './utils/platform.js';
import { DockDocsCrawler, type CrawlerConfig } from './crawler/crawler.js';
import { RagExporter } from './exporters/rag-exporter.js';
import { loadEnvConfig } from './config/env.js';
import { STORAGE_PATHS, PROJECT_ROOT } from './config/constants.js';
import { ensureStorageDirs } from './utils/storage.js';
import { logger } from './utils/logger.js';
import { loadAllDocuments } from './loaders/document-loader.js';
import { reorganizeStorage } from './organizers/storage-organizer.js';
import { rebuildFromRawHtmlCache } from './organizers/cache-rebuilder.js';
import { applyNodeMemoryProfile } from './utils/node-memory.js';
import { runQualityAudit, formatAuditSummary } from './audit/quality-audit.js';
import { getEmailNotifier } from './notifications/email-notifier.js';
import { runPostCrawlPipeline } from './pipeline/post-crawl-pipeline.js';

const program = new Command();

program
  .name('dock-docs-extractor')
  .description('Semantic knowledge base extractor for Dock Tech documentation')
  .version('1.0.0');

program
  .command('login')
  .description('Authenticate and save session for crawling')
  .option('--headed', 'Run browser with GUI (requires DISPLAY / WSLg)')
  .option(
    '--cdp <url>',
    'CDP URL (use "auto" to detect, or http://127.0.0.1:9222 for WSL Chrome)',
  )
  .option('--import <file>', 'Import Playwright storageState JSON file')
  .action(async (opts: { headed?: boolean; cdp?: string; import?: string }) => {
    const appConfig = loadEnvConfig();
    const spinner = ora('Starting authentication...').start();

    const cdpAuto = opts.cdp === 'auto';
    const cdpUrl = cdpAuto ? undefined : (opts.cdp ?? process.env.PLAYWRIGHT_CDP_URL);
    const importPath = opts.import;

    if (opts.headed && isWsl()) {
      if (!process.env.DISPLAY) {
        spinner.fail('WSL sem DISPLAY — não use --headed');
        console.log('\n' + wslLoginHints() + '\n');
        process.exit(1);
      }
      spinner.info('WSL com DISPLAY — usando Chrome do sistema');
    }

    if (!cdpUrl && !cdpAuto && !importPath && isWsl() && !opts.headed) {
      const gw = getDefaultGatewayIp() ?? getWindowsHostIp();
      logger.info(`Dica WSL: npm run chrome:debug  OU  npm run login -- --cdp auto`);
      if (gw && gw !== '8.8.8.8') {
        logger.info(`Windows host (gateway): http://${gw}:9222`);
      }
    }

    try {
      await ensureStorageDirs();
      await performLogin({
        baseUrl: appConfig.baseUrl,
        docsPath: appConfig.docsPath,
        username: appConfig.username,
        password: appConfig.password,
        headless: opts.headed ? false : true,
        manualTimeoutSec: appConfig.manualTimeoutSec,
        cdpUrl,
        cdpAuto,
        importPath,
      });
      spinner.succeed('Authentication successful — session saved');
      logger.info(`Session stored at ${STORAGE_PATHS.session}`);
    } catch (error) {
      spinner.fail('Authentication failed');
      if (error instanceof BrowserLaunchError && error.hints) {
        console.error('\n' + error.hints + '\n');
      }
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Diagnose WSL/CDP connectivity and show recommended login command')
  .action(() => {
    console.log(printCdpDiagnostics());
    if (isWsl()) {
      console.log('\n' + wslLoginHints());
    }
  });

program
  .command('crawl')
  .description('Crawl and extract documentation into semantic knowledge base')
  .option('--headed', 'Run browser in headed mode')
  .option('--resume', 'Resume from saved crawl queue state')
  .option('--no-post-export', 'Skip automatic rebuild/reorganize after crawl')
  .action(async (opts: { headed?: boolean; resume?: boolean; noPostExport?: boolean }) => {
    applyNodeMemoryProfile('crawl');
    const appConfig = loadEnvConfig();
    const spinner = ora('Initializing crawler...').start();

    const headless = opts.headed ? false : appConfig.headless;
    const resume = opts.resume ?? appConfig.resume;

    const authManager = new AuthManager({
      baseUrl: appConfig.baseUrl,
      docsPath: appConfig.docsPath,
      username: appConfig.username,
      password: appConfig.password,
      headless,
      manualTimeoutSec: appConfig.manualTimeoutSec,
    });

    const crawlerConfig: CrawlerConfig = {
      baseUrl: appConfig.baseUrl,
      docsPath: appConfig.docsPath,
      username: appConfig.username,
      password: appConfig.password,
      concurrency: appConfig.concurrency,
      delayMs: appConfig.delayMs,
      maxRetries: appConfig.maxRetries,
      timeoutMs: appConfig.timeoutMs,
      headless,
      manualTimeoutSec: appConfig.manualTimeoutSec,
      resume,
      discoverMode: appConfig.discoverMode,
      maxPages: appConfig.maxPages,
    };

    try {
      await ensureStorageDirs();
      spinner.text = 'Authenticating...';
      await authManager.ensureAuthenticated();
      spinner.succeed('Authenticated — starting crawl');

      const crawler = new DockDocsCrawler(crawlerConfig, authManager);
      await crawler.run();

      spinner.succeed('Crawl completed');

      const autoExport = appConfig.postCrawlAutoExport && !opts.noPostExport;
      if (autoExport) {
        spinner.start('Pipeline pós-crawl: export JSON automático...');
        const pipeline = await runPostCrawlPipeline({
          baseUrl: appConfig.baseUrl,
          timeoutMs: appConfig.timeoutMs,
          authManager,
          runReorganize: appConfig.postCrawlReorganize,
          runAudit: appConfig.postCrawlAudit,
        });
        spinner.succeed(
          `Pipeline concluído — ${pipeline.rebuild.rebuilt} JSON reparseados` +
            (pipeline.reorganize ? `, ${pipeline.reorganize.moved} reorganizados` : ''),
        );
      } else {
        ora().info('Pipeline pós-crawl ignorado (POST_CRAWL_AUTO_EXPORT=false ou --no-post-export)');
      }
    } catch (error) {
      spinner.fail('Crawl failed');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await authManager.close();
    }
  });

program
  .command('test-email')
  .description('Send a test email via SMTP (Hostinger)')
  .action(async () => {
    const spinner = ora('Enviando e-mail de teste...').start();
    try {
      const mail = getEmailNotifier();
      if (!mail.enabled) {
        spinner.fail('SMTP desabilitado — configure SMTP_* no .env');
        process.exit(1);
      }
      await mail.sendTest();
      spinner.succeed('E-mail de teste enviado');
    } catch (error) {
      spinner.fail('Falha ao enviar e-mail');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('Quality audit of extracted JSON (no crawl)')
  .option('--email', 'Send summary by email')
  .action(async (opts: { email?: boolean }) => {
    applyNodeMemoryProfile('default');
    const spinner = ora('Running quality audit...').start();
    try {
      const report = await runQualityAudit();
      const summary = formatAuditSummary(report);
      spinner.succeed('Audit complete');
      console.log('\n' + summary + '\n');
      if (opts.email) {
        await getEmailNotifier().notifyAuditReport(
          {
            Válidos: report.validDocuments,
            Completos: report.byQuality.complete,
            Parciais: report.byQuality.partial,
            Falhos: report.byQuality.failed,
          },
          summary,
        );
      }
    } catch (error) {
      spinner.fail('Audit failed');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('rebuild')
  .description('Rebuild JSON/markdown from raw-html cache + navigation map')
  .action(async () => {
    applyNodeMemoryProfile('rebuild');
    const appConfig = loadEnvConfig();
    const spinner = ora('Rebuilding from raw-html cache...').start();

    try {
      await ensureStorageDirs();
      const result = await rebuildFromRawHtmlCache(appConfig.baseUrl);
      spinner.succeed(
        `Rebuilt ${result.rebuilt} pages (${result.missingUrl} HTML files without URL in navigation)`,
      );
    } catch (error) {
      spinner.fail('Rebuild failed');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('reorganize')
  .description('Reorganize JSON/markdown to match site sidebar hierarchy (no full re-crawl)')
  .option('--dry-run', 'Show what would move without writing files')
  .option('--skip-nav', 'Use saved navigation-flat.json instead of re-harvesting sidebars')
  .action(async (opts: { dryRun?: boolean; skipNav?: boolean }) => {
    const appConfig = loadEnvConfig();
    const spinner = ora('Reorganizing storage to match site navigation...').start();

    const authManager = new AuthManager({
      baseUrl: appConfig.baseUrl,
      docsPath: appConfig.docsPath,
      username: appConfig.username,
      password: appConfig.password,
      headless: appConfig.headless,
      manualTimeoutSec: appConfig.manualTimeoutSec,
    });

    try {
      await ensureStorageDirs();

      let context = null;
      if (!opts.skipNav) {
        spinner.text = 'Authenticating for sidebar harvest...';
        await authManager.ensureAuthenticated();
        context = await authManager.getContext();
      }

      spinner.text = 'Mapping documents to navigation tree...';
      const result = await reorganizeStorage(context, {
        baseUrl: appConfig.baseUrl,
        timeoutMs: appConfig.timeoutMs,
        skipNavHarvest: opts.skipNav,
        dryRun: opts.dryRun,
      });

      const msg = opts.dryRun
        ? `Dry run: ${result.moved} would move, ${result.unchanged} already correct`
        : `Reorganized: ${result.moved} moved, ${result.unchanged} unchanged, ${result.skipped} skipped`;

      spinner.succeed(`${msg} | nav items: ${result.navItems} | domains: ${result.domains}`);
    } catch (error) {
      spinner.fail('Reorganize failed');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      await authManager.close();
    }
  });

program
  .command('export')
  .description('Export extracted data for RAG (ChromaDB, Qdrant)')
  .option('--target <target>', 'Export target: chromadb | qdrant | generic', 'generic')
  .action(async (opts: { target: string }) => {
    applyNodeMemoryProfile('export');
    const spinner = ora('Loading extracted documents...').start();
    const target = opts.target as 'chromadb' | 'qdrant' | 'generic';

    if (!['chromadb', 'qdrant', 'generic'].includes(target)) {
      spinner.fail(`Invalid target: ${target}`);
      process.exit(1);
    }

    try {
      const documents = await loadAllDocuments();
      if (documents.length === 0) {
        spinner.fail('No documents found — run crawl first');
        process.exit(1);
      }

      spinner.text = `Exporting ${documents.length} documents for ${target}...`;
      const ragExporter = new RagExporter();
      const filepath = await ragExporter.exportFromDocuments(documents, target);
      await ragExporter.exportDocumentsSummary(documents);

      spinner.succeed(`RAG export complete → ${filepath}`);
    } catch (error) {
      spinner.fail('Export failed');
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('clean')
  .description('Clean extracted storage and logs')
  .option('--keep-auth', 'Keep authentication session')
  .action(async (opts: { keepAuth?: boolean }) => {
    const spinner = ora('Cleaning storage...').start();

    const dirsToClean = [
      STORAGE_PATHS.rawHtml,
      STORAGE_PATHS.markdown,
      STORAGE_PATHS.json,
      STORAGE_PATHS.navigation,
      STORAGE_PATHS.chunks,
      STORAGE_PATHS.openapi,
      STORAGE_PATHS.graphql,
      STORAGE_PATHS.screenshots,
      STORAGE_PATHS.embeddings,
    ];

    for (const dir of dirsToClean) {
      if (await fs.pathExists(dir)) {
        await fs.emptyDir(dir);
      }
    }

    const queueFile = `${STORAGE_PATHS.navigation}/crawl-queue.json`;
    if (await fs.pathExists(queueFile)) {
      await fs.remove(queueFile);
    }

    if (!opts.keepAuth) {
      await clearSession();
    }

    const logFile = `${PROJECT_ROOT}/logs/extractor.log`;
    if (await fs.pathExists(logFile)) {
      await fs.writeFile(logFile, '');
    }

    spinner.succeed('Storage cleaned');
  });

const args = process.argv.slice(2);
if (args.length === 0) {
  program.help();
} else {
  program.parseAsync(process.argv).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
