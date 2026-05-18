import fs from 'fs-extra';
import { z } from 'zod';
import { storedSessionSchema } from '../config/schemas.js';
import { saveSession } from './session.js';
import { logger } from '../utils/logger.js';

const playwrightStorageStateSchema = z.object({
  cookies: z.array(z.unknown()).optional(),
  origins: z.array(z.unknown()).optional(),
});

export async function importSessionFromFile(
  filePath: string,
  baseUrl: string,
): Promise<object> {
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const raw = await fs.readJson(filePath);

  const fullSession = storedSessionSchema.safeParse(raw);
  if (fullSession.success) {
    await saveSession(fullSession.data.storageState, baseUrl);
    logger.info(`Session imported from ${filePath} (full session format)`);
    return fullSession.data.storageState;
  }

  const storageState = playwrightStorageStateSchema.safeParse(raw);
  if (storageState.success) {
    await saveSession(raw, baseUrl);
    logger.info(`Session imported from ${filePath} (Playwright storageState format)`);
    return raw;
  }

  throw new Error(
    `Invalid session file: ${filePath}. Expected Playwright storageState or full session JSON.`,
  );
}
