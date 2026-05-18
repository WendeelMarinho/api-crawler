import fs from 'fs-extra';
import nodemailer from 'nodemailer';
import { LOG_PATH } from '../config/constants.js';
import { loadNotificationConfig, type NotificationConfig } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  auditReportEmail,
  jobCompletedEmail,
  jobFailedEmail,
  jobProgressEmail,
  jobStartedEmail,
} from './email-templates.js';

export type JobKind =
  | 'crawl'
  | 'rebuild'
  | 'reorganize'
  | 'audit'
  | 'login'
  | 'pipeline-pós-crawl';

export class EmailNotifier {
  private transporter: nodemailer.Transporter | null = null;
  private readonly config: NotificationConfig;
  private lastProgressPct = -1;

  constructor(config?: NotificationConfig) {
    this.config = config ?? loadNotificationConfig();
    if (this.config.smtp.enabled) {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: {
          user: this.config.smtp.user,
          pass: this.config.smtp.pass,
        },
      });
    }
  }

  get enabled(): boolean {
    return this.config.smtp.enabled && Boolean(this.transporter);
  }

  async sendTest(): Promise<void> {
    await this.send('Teste SMTP — Dock Docs Extractor', jobStartedEmail('teste', { status: 'OK' }));
  }

  async notifyJobStarted(job: JobKind, details: Record<string, string | number>): Promise<void> {
    if (!this.config.notify.onStart) return;
    this.lastProgressPct = -1;
    await this.send(`[Dock] Iniciado: ${job}`, jobStartedEmail(job, details));
  }

  async notifyProgress(
    job: JobKind,
    processed: number,
    total: number,
    extra: Record<string, string | number> = {},
    currentUrl?: string,
  ): Promise<void> {
    if (!this.config.notify.onProgress || total <= 0) return;
    const pct = Math.floor((processed / total) * 100);
    const step = this.config.notify.progressEveryPct;

    const milestone =
      pct >= 100 ||
      (pct >= step && this.lastProgressPct < step) ||
      (step === 50 && pct >= 50 && this.lastProgressPct < 50);

    if (!milestone && processed > 0) return;
    if (pct >= 100) return;

    this.lastProgressPct = pct >= step ? step * Math.floor(pct / step) : pct;

    await this.send(
      `[Dock] ${job} ${pct}%`,
      jobProgressEmail(
        job,
        pct,
        { Processadas: processed, Total: total, ...extra },
        currentUrl,
      ),
    );
  }

  async notifyJobCompleted(
    job: JobKind,
    stats: Record<string, string | number>,
  ): Promise<void> {
    if (!this.config.notify.onComplete) return;
    const tail = await readLogTail(this.config.notify.logTailLines);
    await this.send(`[Dock] Concluído: ${job}`, jobCompletedEmail(job, stats, tail));
  }

  async notifyJobFailed(job: JobKind, error: string): Promise<void> {
    if (!this.config.notify.onError) return;
    const tail = await readLogTail(this.config.notify.logTailLines);
    await this.send(`[Dock] ERRO: ${job}`, jobFailedEmail(job, error, tail));
  }

  async notifyAuditReport(summary: Record<string, string | number>, highlights: string): Promise<void> {
    if (!this.config.notify.onComplete) return;
    await this.send('[Dock] Relatório audit', auditReportEmail(summary, highlights));
  }

  private async send(subject: string, html: string): Promise<void> {
    if (!this.enabled || !this.transporter) {
      logger.debug('Email skipped (SMTP disabled)');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.smtp.from,
        to: this.config.smtp.to,
        subject,
        html,
      });
      logger.info(`Email sent: ${subject}`);
    } catch (error) {
      logger.warn('Failed to send email', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function readLogTail(lines: number): Promise<string> {
  try {
    if (!(await fs.pathExists(LOG_PATH))) return '(sem log)';
    const content = await fs.readFile(LOG_PATH, 'utf8');
    const parts = content.split('\n').filter(Boolean);
    return parts.slice(-lines).join('\n') || '(log vazio)';
  } catch {
    return '(não foi possível ler o log)';
  }
}

let defaultNotifier: EmailNotifier | null = null;

export function getEmailNotifier(): EmailNotifier {
  if (!defaultNotifier) defaultNotifier = new EmailNotifier();
  return defaultNotifier;
}
