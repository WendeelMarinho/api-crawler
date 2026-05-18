import fs from 'fs-extra';
import { STORAGE_PATHS } from '../config/constants.js';
import { storedSessionSchema } from '../config/schemas.js';
import { logger } from '../utils/logger.js';

export interface SessionMetadata {
  createdAt: string;
  updatedAt: string;
  baseUrl: string;
  valid: boolean;
}

export interface StoredSession {
  metadata: SessionMetadata;
  storageState: object;
}

export async function sessionExists(): Promise<boolean> {
  return fs.pathExists(STORAGE_PATHS.session);
}

export async function loadSession(): Promise<StoredSession | null> {
  if (!(await sessionExists())) {
    return null;
  }
  try {
    const raw = await fs.readJson(STORAGE_PATHS.session);
    const parsed = storedSessionSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('Session file failed validation');
      return null;
    }
    return parsed.data as StoredSession;
  } catch (error) {
    logger.error('Failed to load session file', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function saveSession(
  storageState: object,
  baseUrl: string,
): Promise<void> {
  await fs.ensureDir(STORAGE_PATHS.auth);

  const existing = await loadSession();
  const now = new Date().toISOString();

  const session: StoredSession = {
    metadata: {
      createdAt: existing?.metadata.createdAt ?? now,
      updatedAt: now,
      baseUrl,
      valid: true,
    },
    storageState,
  };

  await fs.writeJson(STORAGE_PATHS.session, session, { spaces: 2 });
  logger.info('Session saved successfully');
}

export async function invalidateSession(): Promise<void> {
  const session = await loadSession();
  if (session) {
    session.metadata.valid = false;
    session.metadata.updatedAt = new Date().toISOString();
    await fs.writeJson(STORAGE_PATHS.session, session, { spaces: 2 });
  }
  logger.info('Session marked as invalid');
}

export async function clearSession(): Promise<void> {
  if (await sessionExists()) {
    await fs.remove(STORAGE_PATHS.session);
    logger.info('Session cleared');
  }
}
