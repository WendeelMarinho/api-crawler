import type { Browser, BrowserContext } from 'playwright';
import { logger } from '../utils/logger.js';
import { launchBrowser } from './browser.js';
import { performLogin } from './login.js';
import {
  clearSession,
  invalidateSession,
  loadSession,
  saveSession,
  sessionExists,
} from './session.js';

export interface AuthManagerConfig {
  baseUrl: string;
  docsPath: string;
  username?: string;
  password?: string;
  headless: boolean;
  manualTimeoutSec: number;
}

export class AuthManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private storageState: object | null = null;

  constructor(private readonly config: AuthManagerConfig) {}

  async ensureAuthenticated(): Promise<object> {
    if (await sessionExists()) {
      const session = await loadSession();
      if (session?.metadata.valid && session.storageState) {
        const valid = await this.validateSession(session.storageState);
        if (valid) {
          logger.info('Reusing existing session');
          this.storageState = session.storageState;
          return session.storageState;
        }
        logger.warn('Stored session is invalid — re-authenticating');
        await invalidateSession();
      }
    }

    logger.info('Starting authentication flow');
    const storageState = await performLogin({
      baseUrl: this.config.baseUrl,
      docsPath: this.config.docsPath,
      username: this.config.username,
      password: this.config.password,
      headless: this.config.headless,
      manualTimeoutSec: this.config.manualTimeoutSec,
    });

    this.storageState = storageState;
    return storageState;
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await launchBrowser({ headless: this.config.headless });
    }
    return this.browser;
  }

  async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      const state = this.storageState ?? (await this.ensureAuthenticated());
      const browser = await this.getBrowser();
      this.context = await browser.newContext({
        storageState: state as never,
        viewport: { width: 1440, height: 900 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      });
    }
    return this.context;
  }

  async refreshSession(): Promise<object> {
    await clearSession();
    this.storageState = null;
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    return this.ensureAuthenticated();
  }

  async close(): Promise<void> {
    if (this.context) {
      const state = await this.context.storageState();
      await saveSession(state, this.config.baseUrl);
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async validateSession(storageState: object): Promise<boolean> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await launchBrowser({ headless: true });
      context = await browser.newContext({
        storageState: storageState as never,
      });

      const page = await context.newPage();
      const url = new URL(this.config.docsPath, this.config.baseUrl).href;
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      if (!response || response.status() >= 400) {
        return false;
      }

      const isLoginPage = /login|signin|sign-in|auth\//i.test(page.url());
      if (isLoginPage) return false;

      const hasDocContent = await page
        .locator('article, main, .rm-Article, .rm-Sidebar, nav')
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      return hasDocContent;
    } catch {
      return false;
    } finally {
      await context?.close();
      await browser?.close();
    }
  }
}
