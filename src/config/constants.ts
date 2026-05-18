import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const STORAGE_PATHS = {
  auth: path.join(PROJECT_ROOT, 'storage/auth'),
  session: path.join(PROJECT_ROOT, 'storage/auth/session.json'),
  rawHtml: path.join(PROJECT_ROOT, 'storage/raw-html'),
  markdown: path.join(PROJECT_ROOT, 'storage/markdown'),
  json: path.join(PROJECT_ROOT, 'storage/json'),
  navigation: path.join(PROJECT_ROOT, 'storage/navigation'),
  chunks: path.join(PROJECT_ROOT, 'storage/chunks'),
  openapi: path.join(PROJECT_ROOT, 'storage/openapi'),
  graphql: path.join(PROJECT_ROOT, 'storage/graphql'),
  screenshots: path.join(PROJECT_ROOT, 'storage/screenshots'),
  embeddings: path.join(PROJECT_ROOT, 'storage/embeddings'),
  /** Full-page extraction debug (HTML + PNG per doc id when enabled) */
  extractionDebug: path.join(PROJECT_ROOT, 'storage/debug-extraction'),
} as const;

export const LOG_PATH = path.join(PROJECT_ROOT, 'logs/extractor.log');

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const IGNORED_URL_PATTERNS = [
  /logout/i,
  /signout/i,
  /sign-out/i,
  /\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|css|js|map)(\?|$)/i,
  /#$/,
  /^mailto:/i,
  /^tel:/i,
  /javascript:/i,
];

export const EXTERNAL_HOST_ALLOWLIST: string[] = [];

export const OPENAPI_PATTERNS = [
  /openapi\.json/i,
  /openapi\.yaml/i,
  /swagger\.json/i,
  /swagger\.yaml/i,
  /api-docs/i,
  /v\d+\/openapi/i,
];

export const GRAPHQL_PATTERNS = [/graphql/i, /\/gql\b/i];

export const DEFAULT_CONFIG = {
  concurrency: 3,
  delayMs: 500,
  maxRetries: 3,
  timeoutMs: 60_000,
  headless: true,
  chunkMaxTokens: 512,
  manualLoginTimeoutSec: 300,
  discoverMode: 'sidebar' as const,
  maxPages: 0,
} as const;
