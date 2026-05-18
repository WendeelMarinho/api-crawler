/** Heap limits aligned with VPS 32GB — override via .env */
export type MemoryProfile = 'crawl' | 'rebuild' | 'export' | 'default';

export function maxOldSpaceMb(profile: MemoryProfile): number {
  const env = process.env;
  switch (profile) {
    case 'crawl':
      return parseInt(env.NODE_MAX_OLD_SPACE_CRAWL ?? '16384', 10);
    case 'rebuild':
      return parseInt(env.NODE_MAX_OLD_SPACE_REBUILD ?? '8192', 10);
    case 'export':
      return parseInt(env.NODE_MAX_OLD_SPACE_EXPORT ?? '8192', 10);
    default:
      return parseInt(env.NODE_MAX_OLD_SPACE_MB ?? '4096', 10);
  }
}

export function applyNodeMemoryProfile(profile: MemoryProfile): void {
  const mb = maxOldSpaceMb(profile);
  const existing = process.env.NODE_OPTIONS ?? '';
  const stripped = existing.replace(/--max-old-space-size=\d+/g, '').trim();
  process.env.NODE_OPTIONS = `${stripped} --max-old-space-size=${mb}`.trim();
}
