/** Lightweight crawl record kept in memory (full doc is on disk). */
export interface CrawlDocumentMeta {
  id: string;
  url: string;
  domain: string;
  title: string;
  type: string;
  contentHash: string;
}
