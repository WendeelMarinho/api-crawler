import fs from 'fs-extra';
import path from 'node:path';
import { z } from 'zod';
import { STORAGE_PATHS } from '../config/constants.js';
import { logger } from '../utils/logger.js';

const queueSnapshotSchema = z.object({
  pending: z.array(z.string().min(1)),
  visited: z.array(z.string().min(1)),
  failed: z.record(z.string()),
  updatedAt: z.string(),
});

export type QueueSnapshot = z.infer<typeof queueSnapshotSchema>;

const QUEUE_FILE = path.join(STORAGE_PATHS.navigation, 'crawl-queue.json');

export class CrawlQueue {
  private readonly pending: string[] = [];
  private readonly visited = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly failed = new Map<string, string>();

  enqueue(url: string): boolean {
    const normalized = this.normalize(url);
    if (this.visited.has(normalized) || this.queued.has(normalized)) {
      return false;
    }
    this.queued.add(normalized);
    this.pending.push(normalized);
    return true;
  }

  enqueueMany(urls: string[]): number {
    let added = 0;
    for (const url of urls) {
      if (this.enqueue(url)) added++;
    }
    return added;
  }

  dequeue(): string | undefined {
    const url = this.pending.shift();
    if (url) {
      this.queued.delete(url);
    }
    return url;
  }

  markVisited(url: string): void {
    const normalized = this.normalize(url);
    this.visited.add(normalized);
    this.queued.delete(normalized);
  }

  markFailed(url: string, reason: string): void {
    const normalized = this.normalize(url);
    this.failed.set(normalized, reason);
    this.queued.delete(normalized);
  }

  isVisited(url: string): boolean {
    return this.visited.has(this.normalize(url));
  }

  get size(): number {
    return this.pending.length;
  }

  get visitedCount(): number {
    return this.visited.size;
  }

  get failedUrls(): Map<string, string> {
    return new Map(this.failed);
  }

  get visitedUrls(): string[] {
    return [...this.visited];
  }

  get pendingUrls(): string[] {
    return [...this.pending];
  }

  snapshot(): { pending: number; visited: number; failed: number } {
    return {
      pending: this.pending.length,
      visited: this.visited.size,
      failed: this.failed.size,
    };
  }

  async persist(): Promise<void> {
    const data: QueueSnapshot = {
      pending: this.pendingUrls,
      visited: this.visitedUrls,
      failed: Object.fromEntries(this.failed),
      updatedAt: new Date().toISOString(),
    };

    await fs.ensureDir(STORAGE_PATHS.navigation);
    await fs.writeJson(QUEUE_FILE, data, { spaces: 2 });
  }

  static async load(): Promise<CrawlQueue | null> {
    if (!(await fs.pathExists(QUEUE_FILE))) {
      return null;
    }

    try {
      const raw = await fs.readJson(QUEUE_FILE);
      const parsed = queueSnapshotSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Invalid crawl queue snapshot — ignoring');
        return null;
      }

      const queue = new CrawlQueue();
      for (const url of parsed.data.visited) {
        queue.visited.add(queue.normalize(url));
      }
      for (const [url, reason] of Object.entries(parsed.data.failed)) {
        queue.failed.set(queue.normalize(url), reason);
      }
      queue.enqueueMany(parsed.data.pending);

      logger.info(
        `Queue restored: ${parsed.data.pending.length} pending, ${parsed.data.visited.length} visited`,
      );
      return queue;
    } catch (error) {
      logger.warn('Failed to load crawl queue', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private normalize(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.href.replace(/\/$/, '');
    } catch {
      return url;
    }
  }
}
