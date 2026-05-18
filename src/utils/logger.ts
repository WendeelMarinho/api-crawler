import winston from 'winston';
import fs from 'fs-extra';
import path from 'node:path';
import { LOG_PATH } from '../config/constants.js';

const SENSITIVE_PATTERNS = [
  /Bearer\s+[\w.-]+/gi,
  /token[=:]\s*["']?[\w.-]+/gi,
  /password[=:]\s*["']?[^\s"']+/gi,
  /cookie[=:]\s*["']?[^\s"']+/gi,
  /set-cookie/gi,
  /authorization[=:]\s*["']?[\w.-]+/gi,
];

function sanitize(message: string): string {
  let result = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

fs.ensureDirSync(path.dirname(LOG_PATH));

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return sanitize(`${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`);
    }),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message }) => sanitize(`${level}: ${message}`)),
      ),
    }),
    new winston.transports.File({
      filename: LOG_PATH,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});
