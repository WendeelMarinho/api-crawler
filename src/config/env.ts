import { z } from 'zod';
import { DEFAULT_CONFIG } from './constants.js';

const envSchema = z.object({
  DOCK_BASE_URL: z.string().url().default('https://developers.dock.tech'),
  DOCK_DOCS_PATH: z.string().min(1).default('/reference/inicio'),
  DOCK_USERNAME: z.string().optional(),
  DOCK_PASSWORD: z.string().optional(),
  CRAWL_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(DEFAULT_CONFIG.concurrency),
  CRAWL_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(DEFAULT_CONFIG.delayMs),
  CRAWL_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(DEFAULT_CONFIG.maxRetries),
  CRAWL_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(DEFAULT_CONFIG.timeoutMs),
  CRAWL_HEADLESS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  CRAWL_RESUME: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  MANUAL_LOGIN_TIMEOUT_SEC: z.coerce
    .number()
    .int()
    .min(30)
    .max(900)
    .default(DEFAULT_CONFIG.manualLoginTimeoutSec),
  CHUNK_MAX_TOKENS: z.coerce.number().int().min(128).max(4096).default(DEFAULT_CONFIG.chunkMaxTokens),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  CRAWL_DISCOVER_MODE: z.enum(['sidebar', 'full']).default('sidebar'),
  CRAWL_MAX_PAGES: z.coerce.number().int().min(0).max(50_000).default(0),
  NODE_MAX_OLD_SPACE_CRAWL: z.coerce.number().int().min(512).max(32768).optional(),
  NODE_MAX_OLD_SPACE_REBUILD: z.coerce.number().int().min(512).max(32768).optional(),
  NODE_MAX_OLD_SPACE_EXPORT: z.coerce.number().int().min(512).max(32768).optional(),
  SMTP_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_TO: z.string().optional(),
  NOTIFY_ON_START: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  NOTIFY_ON_PROGRESS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  NOTIFY_PROGRESS_EVERY_PCT: z.coerce.number().int().min(25).max(100).default(50),
  POST_CRAWL_AUTO_EXPORT: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  POST_CRAWL_REORGANIZE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  POST_CRAWL_AUDIT: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  NOTIFY_ON_ERROR: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  NOTIFY_ON_COMPLETE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  NOTIFY_LOG_TAIL_LINES: z.coerce.number().int().min(5).max(200).default(40),
});

export type EnvConfig = z.infer<typeof envSchema>;

export interface AppConfig {
  baseUrl: string;
  docsPath: string;
  username?: string;
  password?: string;
  concurrency: number;
  delayMs: number;
  maxRetries: number;
  timeoutMs: number;
  headless: boolean;
  resume: boolean;
  manualTimeoutSec: number;
  chunkMaxTokens: number;
  logLevel: string;
  discoverMode: 'sidebar' | 'full';
  maxPages: number;
  postCrawlAutoExport: boolean;
  postCrawlReorganize: boolean;
  postCrawlAudit: boolean;
}

export interface NotificationConfig {
  smtp: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    to: string;
  };
  notify: {
    onStart: boolean;
    onProgress: boolean;
    progressEveryPct: number;
    onError: boolean;
    onComplete: boolean;
    logTailLines: number;
  };
}

export function loadNotificationConfig(env: NodeJS.ProcessEnv = process.env): NotificationConfig {
  const parsed = envSchema.safeParse(env);
  const e = parsed.success
    ? parsed.data
    : envSchema.parse({
        DOCK_BASE_URL: env.DOCK_BASE_URL,
        SMTP_ENABLED: env.SMTP_ENABLED,
        SMTP_HOST: env.SMTP_HOST,
        SMTP_PORT: env.SMTP_PORT,
        SMTP_USER: env.SMTP_USER,
        SMTP_PASS: env.SMTP_PASS,
        SMTP_FROM: env.SMTP_FROM,
        SMTP_TO: env.SMTP_TO,
      });

  const toList = (e.SMTP_TO ?? '').split(',').map((s) => s.trim()).filter(Boolean).join(', ');

  return {
    smtp: {
      enabled: e.SMTP_ENABLED === true && Boolean(e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS),
      host: e.SMTP_HOST ?? '',
      port: e.SMTP_PORT ?? 465,
      secure: e.SMTP_SECURE !== false,
      user: e.SMTP_USER ?? '',
      pass: e.SMTP_PASS ?? '',
      from: e.SMTP_FROM ?? e.SMTP_USER ?? 'dock-extractor@localhost',
      to: toList || 'noreply@localhost',
    },
    notify: {
      onStart: e.NOTIFY_ON_START !== false,
      onProgress: e.NOTIFY_ON_PROGRESS !== false,
      progressEveryPct: e.NOTIFY_PROGRESS_EVERY_PCT ?? 50,
      onError: e.NOTIFY_ON_ERROR !== false,
      onComplete: e.NOTIFY_ON_COMPLETE !== false,
      logTailLines: e.NOTIFY_LOG_TAIL_LINES ?? 40,
    },
  };
}

export function loadEnvConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const e = parsed.data;

  return {
    baseUrl: e.DOCK_BASE_URL.replace(/\/$/, ''),
    docsPath: e.DOCK_DOCS_PATH,
    username: e.DOCK_USERNAME,
    password: e.DOCK_PASSWORD,
    concurrency: e.CRAWL_CONCURRENCY,
    delayMs: e.CRAWL_DELAY_MS,
    maxRetries: e.CRAWL_MAX_RETRIES,
    timeoutMs: e.CRAWL_TIMEOUT_MS,
    headless: e.CRAWL_HEADLESS,
    resume: e.CRAWL_RESUME,
    manualTimeoutSec: e.MANUAL_LOGIN_TIMEOUT_SEC,
    chunkMaxTokens: e.CHUNK_MAX_TOKENS,
    logLevel: e.LOG_LEVEL,
    discoverMode: e.CRAWL_DISCOVER_MODE,
    maxPages: e.CRAWL_MAX_PAGES,
    postCrawlAutoExport: e.POST_CRAWL_AUTO_EXPORT !== false,
    postCrawlReorganize: e.POST_CRAWL_REORGANIZE !== false,
    postCrawlAudit: e.POST_CRAWL_AUDIT === true,
  };
}
