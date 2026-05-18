import { chromium, type Browser, type LaunchOptions } from 'playwright';
import { logger } from '../utils/logger.js';
import {
  detectBestCdpUrl,
  getCdpUrlCandidates,
  hasDisplay,
  isWsl,
  wslLoginHints,
} from '../utils/platform.js';

const LINUX_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-setuid-sandbox',
];

export class BrowserLaunchError extends Error {
  constructor(
    message: string,
    readonly hints?: string,
  ) {
    super(message);
    this.name = 'BrowserLaunchError';
  }
}

export interface BrowserLaunchConfig {
  headless: boolean;
  cdpUrl?: string;
  cdpAuto?: boolean;
}

export function assertHeadedSupported(wantsHeaded: boolean): void {
  if (wantsHeaded && isWsl() && !hasDisplay()) {
    throw new BrowserLaunchError(
      'Modo --headed indisponível no WSL sem DISPLAY. Use: npm run chrome:debug + npm run login -- --cdp http://127.0.0.1:9222',
      wslLoginHints(),
    );
  }
}

async function connectCdp(url: string, timeoutMs = 15_000): Promise<Browser> {
  logger.info(`Connecting via CDP: ${url}`);
  return chromium.connectOverCDP(url, { timeout: timeoutMs });
}

export async function connectCdpWithFallback(
  explicitUrl?: string,
  auto = false,
): Promise<{ browser: Browser; cdpUrl: string }> {
  const candidates: string[] = [];

  if (explicitUrl && explicitUrl !== 'auto') {
    candidates.push(explicitUrl);
  }

  if (auto || !explicitUrl) {
    const detected = detectBestCdpUrl();
    if (detected) candidates.unshift(detected);
    for (const url of getCdpUrlCandidates()) {
      if (!candidates.includes(url)) candidates.push(url);
    }
  }

  const errors: string[] = [];

  for (const url of candidates) {
    try {
      const browser = await connectCdp(url);
      return { browser, cdpUrl: url };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${url}: ${msg}`);
      logger.debug(`CDP failed for ${url}`);
    }
  }

  throw new BrowserLaunchError(
    `Nenhum endpoint CDP respondeu.\n${errors.join('\n')}`,
    wslLoginHints(),
  );
}

export async function launchBrowser(config: BrowserLaunchConfig): Promise<Browser> {
  if (config.cdpUrl || config.cdpAuto) {
    const { browser } = await connectCdpWithFallback(config.cdpUrl, config.cdpAuto);
    return browser;
  }

  const headless = config.headless;
  const launchOptions: LaunchOptions = {
    headless,
    args: LINUX_ARGS,
  };

  const strategies: Array<{ name: string; options: LaunchOptions }> = [];

  if (isWsl() && hasDisplay() && !headless) {
    strategies.push(
      { name: 'wsl-google-chrome', options: { ...launchOptions, channel: 'chrome' } },
      { name: 'wsl-chromium', options: { ...launchOptions, channel: 'chromium' } },
    );
  }

  strategies.push(
    { name: 'playwright-chromium', options: launchOptions },
    { name: 'system-chrome', options: { ...launchOptions, channel: 'chrome' } },
    { name: 'system-msedge', options: { ...launchOptions, channel: 'msedge' } },
  );

  const errors: string[] = [];

  for (const { name, options } of strategies) {
    try {
      logger.info(`Launching browser (${name}, headless=${headless})`);
      return await chromium.launch(options);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${name}: ${msg}`);
    }
  }

  throw new BrowserLaunchError(
    `Could not launch browser.\n${errors.join('\n')}`,
    isWsl() ? wslLoginHints() : undefined,
  );
}

export async function connectOrLaunch(
  config: BrowserLaunchConfig & { allowHeadlessFallback?: boolean },
): Promise<Browser> {
  if (config.cdpUrl || config.cdpAuto) {
    const { browser } = await connectCdpWithFallback(config.cdpUrl, config.cdpAuto);
    return browser;
  }

  const wantsHeaded = !config.headless;
  if (wantsHeaded) assertHeadedSupported(true);

  try {
    return await launchBrowser(config);
  } catch (error) {
    if (wantsHeaded && config.allowHeadlessFallback) {
      logger.warn('Headed launch failed — falling back to headless');
      return launchBrowser({ headless: true });
    }
    throw error;
  }
}
