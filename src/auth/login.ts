import type { Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger.js';
import { saveSession } from './session.js';
import { BrowserLaunchError, connectOrLaunch } from './browser.js';
import { importSessionFromFile } from './import-session.js';
import { isWsl, wslLoginHints } from '../utils/platform.js';

export interface LoginConfig {
  baseUrl: string;
  docsPath: string;
  username?: string;
  password?: string;
  headless: boolean;
  manualTimeoutSec: number;
  cdpUrl?: string;
  cdpAuto?: boolean;
  importPath?: string;
}

export async function performLogin(config: LoginConfig): Promise<object> {
  if (config.importPath) {
    return importSessionFromFile(config.importPath, config.baseUrl);
  }

  let browser: Browser;
  const useCdp = Boolean(config.cdpUrl || config.cdpAuto);

  try {
    browser = await connectOrLaunch({
      headless: config.headless,
      cdpUrl: config.cdpUrl,
      cdpAuto: config.cdpAuto,
      allowHeadlessFallback: !useCdp && Boolean(config.username && config.password),
    });
  } catch (error) {
    if (error instanceof BrowserLaunchError && error.hints) {
      logger.error(error.message);
      console.error('\n' + error.hints + '\n');
    }
    throw error;
  }

  try {
    const context = await getOrCreateContext(browser, useCdp);
    const page = await getOrCreatePage(context, useCdp);
    const targetUrl = new URL(config.docsPath, config.baseUrl).href;

    logger.info(`Navigating to ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const alreadyLoggedIn = await detectLoggedIn(page);
    if (alreadyLoggedIn) {
      logger.info('Already authenticated — saving session');
    } else {
      const loggedIn = await attemptAutomatedLogin(page, config);
      if (!loggedIn) {
        if (config.headless || useCdp) {
          if (useCdp) {
            logger.info('Complete login in the Chrome window connected via CDP');
          } else {
            logger.info('Waiting for session (headless mode — use CDP or --import if SSO is required)');
          }
          await waitForManualLogin(page, config);
        } else {
          logger.info('Waiting for manual login in browser window');
          await waitForManualLogin(page, config);
        }
      }
    }

    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      logger.warn('Network idle timeout after login — continuing');
    });

    const storageState = await context.storageState();
    await saveSession(storageState, config.baseUrl);
    return storageState;
  } finally {
    if (!useCdp) {
      await browser.close();
    } else {
      await browser.close();
      logger.info('Disconnected from CDP browser (Chrome remains open)');
    }
  }
}

async function getOrCreateContext(browser: Browser, useCdp: boolean): Promise<BrowserContext> {
  if (useCdp && browser.contexts().length > 0) {
    return browser.contexts()[0];
  }

  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
}

async function getOrCreatePage(context: BrowserContext, useCdp: boolean): Promise<Page> {
  if (useCdp && context.pages().length > 0) {
    return context.pages()[0];
  }
  return context.newPage();
}

async function detectLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (/login|signin|sign-in/i.test(url) && !/logout/i.test(url)) {
    return false;
  }

  return page
    .locator('[data-testid="sidebar"], .rm-Sidebar, .rm-Article, article')
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
}

async function attemptAutomatedLogin(page: Page, config: LoginConfig): Promise<boolean> {
  if (!config.username || !config.password) {
    return false;
  }

  const loginSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[id="email"]',
    '#username',
  ];

  const passwordSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];

  try {
    for (const selector of loginSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible({ timeout: 3000 }).catch(() => false)) {
        await field.fill(config.username);
        break;
      }
    }

    for (const selector of passwordSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible({ timeout: 3000 }).catch(() => false)) {
        await field.fill(config.password);
        break;
      }
    }

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Entrar")',
      'button:has-text("Login")',
    ];

    for (const selector of submitSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
        return await detectLoggedIn(page);
      }
    }
  } catch (error) {
    logger.warn('Automated login attempt failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return false;
}

async function waitForManualLogin(page: Page, config: LoginConfig): Promise<void> {
  const timeout = config.manualTimeoutSec * 1000;
  const start = Date.now();
  const initialUrl = page.url();

  if (isWsl() && config.headless && !config.cdpUrl) {
    logger.warn(wslLoginHints());
  }

  logger.info(
    `Waiting for authenticated session (up to ${config.manualTimeoutSec}s). ` +
      (config.cdpUrl ? 'Complete login in the connected Chrome window.' : 'Detecting documentation content...'),
  );

  while (Date.now() - start < timeout) {
    await page.waitForTimeout(2000);

    if (await detectLoggedIn(page)) {
      logger.info('Authentication detected — documentation content visible');
      return;
    }

    const currentUrl = page.url();
    const urlChanged = currentUrl !== initialUrl && !/login|signin/i.test(currentUrl);
    if (urlChanged && (await detectLoggedIn(page))) {
      return;
    }
  }

  throw new Error(
    `Login timeout after ${config.manualTimeoutSec}s. ` +
      (isWsl() ? 'On WSL, use: npm run login -- --cdp http://<windows-host>:9222' : 'Try --headed or set credentials in .env'),
  );
}
