import type { BrowserContext } from 'playwright';
import { AuthManager } from '../auth/auth-manager.js';
import { runQualityAudit, formatAuditSummary } from '../audit/quality-audit.js';
import { loadEnvConfig } from '../config/env.js';
import { getEmailNotifier } from '../notifications/email-notifier.js';
import { rebuildFromRawHtmlCache } from '../organizers/cache-rebuilder.js';
import { reorganizeStorage } from '../organizers/storage-organizer.js';
import { logger } from '../utils/logger.js';

export interface PostCrawlPipelineOptions {
  baseUrl: string;
  timeoutMs: number;
  authManager: AuthManager;
  runReorganize?: boolean;
  runAudit?: boolean;
}

export interface PostCrawlPipelineResult {
  rebuild: { rebuilt: number; missingUrl: number };
  reorganize?: { moved: number; unchanged: number; skipped: number };
  auditSummary?: string;
}

/**
 * Após o crawl: reparse HTML → JSON (qualidade) + reorganiza pastas + audit opcional.
 */
export async function runPostCrawlPipeline(
  options: PostCrawlPipelineOptions,
): Promise<PostCrawlPipelineResult> {
  const mail = getEmailNotifier();
  const appConfig = loadEnvConfig();
  const runReorganize = options.runReorganize ?? appConfig.postCrawlReorganize;
  const runAudit = options.runAudit ?? appConfig.postCrawlAudit;
  const startedAt = Date.now();

  await mail.notifyJobStarted('pipeline-pós-crawl', {
    Rebuild: 'sim',
    Reorganizar: runReorganize ? 'sim' : 'não',
    Audit: runAudit ? 'sim' : 'não',
  });

  try {
    logger.info('Post-crawl pipeline: rebuild JSON from raw-html cache');
    const rebuild = await rebuildFromRawHtmlCache(options.baseUrl, {
      cleanOutput: false,
      quietNotifications: true,
    });

    let reorganize: PostCrawlPipelineResult['reorganize'];
    if (runReorganize) {
      logger.info('Post-crawl pipeline: reorganize storage');
      let context: BrowserContext | null = null;
      try {
        await options.authManager.ensureAuthenticated();
        context = await options.authManager.getContext();
      } catch (error) {
        logger.warn('Reorganize skipped — auth failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (context) {
        reorganize = await reorganizeStorage(context, {
          baseUrl: options.baseUrl,
          timeoutMs: options.timeoutMs,
          skipNavHarvest: false,
          dryRun: false,
          quietNotifications: true,
        });
      }
    }

    let auditSummary: string | undefined;
    if (runAudit) {
      const report = await runQualityAudit();
      auditSummary = formatAuditSummary(report);
    }

    const durationMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
    await mail.notifyJobCompleted('pipeline-pós-crawl', {
      Reparseadas: rebuild.rebuilt,
      'Sem URL': rebuild.missingUrl,
      Movidos: reorganize?.moved ?? 0,
      'Duração (min)': durationMin,
    });

    if (auditSummary && runAudit) {
      await mail.notifyAuditReport(
        {
          Reparseadas: rebuild.rebuilt,
          Pipeline: 'concluído',
        },
        auditSummary,
      );
    }

    return { rebuild, reorganize, auditSummary };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await mail.notifyJobFailed('pipeline-pós-crawl', msg);
    throw error;
  }
}
