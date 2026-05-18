import fs from 'fs-extra';
import { STORAGE_PATHS } from '../config/constants.js';

const ALL_STORAGE_DIRS = [
  STORAGE_PATHS.auth,
  STORAGE_PATHS.rawHtml,
  STORAGE_PATHS.markdown,
  STORAGE_PATHS.json,
  STORAGE_PATHS.navigation,
  STORAGE_PATHS.chunks,
  STORAGE_PATHS.openapi,
  STORAGE_PATHS.graphql,
  STORAGE_PATHS.screenshots,
  STORAGE_PATHS.embeddings,
] as const;

export async function ensureStorageDirs(): Promise<void> {
  await Promise.all(ALL_STORAGE_DIRS.map((dir) => fs.ensureDir(dir)));
}
