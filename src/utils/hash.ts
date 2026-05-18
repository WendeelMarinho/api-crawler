import { createHash } from 'node:crypto';

export function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

export function urlHash(url: string): string {
  return createHash('md5').update(url, 'utf8').digest('hex').slice(0, 12);
}
