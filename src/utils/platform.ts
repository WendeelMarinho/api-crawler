import fs from 'node:fs';
import { execSync } from 'node:child_process';

const PUBLIC_DNS = new Set([
  '8.8.8.8',
  '8.8.4.4',
  '1.1.1.1',
  '1.0.0.1',
  '9.9.9.9',
  '208.67.222.222',
]);

export function isWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return version.includes('microsoft') || version.includes('wsl');
  } catch {
    return false;
  }
}

export function hasDisplay(): boolean {
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/** Default gateway — on WSL2 this is usually the Windows host. */
export function getDefaultGatewayIp(): string | null {
  try {
    const out = execSync("ip -4 route show default 2>/dev/null | awk '{print $3}' | head -1", {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (out && !PUBLIC_DNS.has(out)) return out;
  } catch {
    // ignore
  }
  return null;
}

/** Nameserver from resolv.conf, skipping public DNS resolvers. */
export function getResolvNameserver(): string | null {
  try {
    const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
    for (const line of resolv.split('\n')) {
      const match = line.match(/^nameserver\s+(\S+)/);
      if (match && !PUBLIC_DNS.has(match[1])) {
        return match[1];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/** Windows host IP via PowerShell (WSL interop). */
export function getWindowsHostViaPowerShell(): string | null {
  if (!isWsl()) return null;
  try {
    const out = execSync(
      'powershell.exe -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq \'Up\' } | Select-Object -First 1).IPv4Address.IPAddress"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 8000 },
    ).trim();
    const ip = out.split('\n')[0]?.trim();
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
  } catch {
    // ignore
  }
  return null;
}

/** Best guess for Windows host — NOT 8.8.8.8. */
export function getWindowsHostIp(): string | null {
  return (
    getDefaultGatewayIp() ??
    getWindowsHostViaPowerShell() ??
    getResolvNameserver()
  );
}

export function findWslChromeBinary(): string | null {
  const candidates = [
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium',
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
  ];

  for (const bin of candidates) {
    try {
      if (bin.includes('/')) {
        if (fs.existsSync(bin)) return bin;
      } else {
        execSync(`command -v ${bin}`, { stdio: 'ignore' });
        return bin;
      }
    } catch {
      // not found
    }
  }
  return null;
}

/** CDP URLs to try, in priority order. */
export function getCdpUrlCandidates(): string[] {
  const seen = new Set<string>();
  const add = (host: string) => {
    const url = host.startsWith('http') ? host : `http://${host}:9222`;
    if (!seen.has(url)) {
      seen.add(url);
      return url;
    }
    return null;
  };

  const urls: string[] = [];

  const push = (host: string | null) => {
    if (!host) return;
    const u = add(host);
    if (u) urls.push(u);
  };

  if (process.env.PLAYWRIGHT_CDP_URL) {
    push(process.env.PLAYWRIGHT_CDP_URL);
  }

  push('http://127.0.0.1:9222');
  push('http://localhost:9222');
  push(getDefaultGatewayIp() ? `http://${getDefaultGatewayIp()}:9222` : null);
  push(getWindowsHostViaPowerShell() ? `http://${getWindowsHostViaPowerShell()}:9222` : null);

  const resolv = getResolvNameserver();
  if (resolv) push(`http://${resolv}:9222`);

  return urls;
}

export function isCdpReachable(cdpUrl: string, timeoutMs = 2000): boolean {
  try {
    const base = cdpUrl.replace(/\/$/, '');
    execSync(`curl -sf --connect-timeout ${Math.ceil(timeoutMs / 1000)} "${base}/json/version"`, {
      stdio: 'ignore',
      timeout: timeoutMs + 500,
    });
    return true;
  } catch {
    return false;
  }
}

export function detectBestCdpUrl(): string | null {
  for (const url of getCdpUrlCandidates()) {
    if (isCdpReachable(url)) return url;
  }
  return null;
}

export function printCdpDiagnostics(): string {
  const lines: string[] = ['=== CDP diagnostics ===', ''];

  lines.push(`WSL: ${isWsl()}`);
  lines.push(`DISPLAY: ${process.env.DISPLAY ?? '(not set)'}`);
  lines.push(`WAYLAND: ${process.env.WAYLAND_DISPLAY ?? '(not set)'}`);
  lines.push(`Chrome binary: ${findWslChromeBinary() ?? '(not found)'}`);
  lines.push(`Default gateway: ${getDefaultGatewayIp() ?? '(unknown)'}`);
  lines.push(`Windows host (PS): ${getWindowsHostViaPowerShell() ?? '(unknown)'}`);
  lines.push(`resolv.conf nameserver: ${getResolvNameserver() ?? '(none/private)'}`);
  lines.push('');

  lines.push('CDP endpoints:');
  for (const url of getCdpUrlCandidates()) {
    const ok = isCdpReachable(url);
    lines.push(`  ${ok ? '✓' : '✗'} ${url}`);
  }

  const best = detectBestCdpUrl();
  lines.push('');
  lines.push(best ? `Recommended: ${best}` : 'No CDP endpoint reachable. Start Chrome with --remote-debugging-port=9222');

  return lines.join('\n');
}

export function wslLoginHints(): string {
  const gw = getDefaultGatewayIp();
  const winPs = getWindowsHostViaPowerShell();
  const chrome = findWslChromeBinary();

  return [
    'WSL — o Playwright bundled Chromium com GUI (--headed) costuma falhar (SIGSEGV).',
  'Use Chrome do WSL ou do Windows via CDP.',
    '',
    '── Opção A: Chrome no WSL (WSLg) ──',
    chrome
      ? `  Terminal 1: npm run chrome:debug\n  Terminal 2: npm run login -- --cdp http://127.0.0.1:9222`
      : '  Instale: sudo apt install google-chrome-stable\n  Depois: npm run chrome:debug',
    '',
    '── Opção B: Chrome no Windows ──',
    '  PowerShell:',
    '    & "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe" `',
    '      --remote-debugging-port=9222 `',
    '      --user-data-dir="$env:TEMP\\chrome-dock-debug"',
    '  WSL:',
    gw
      ? `    npm run login -- --cdp http://${gw}:9222`
      : winPs
        ? `    npm run login -- --cdp http://${winPs}:9222`
        : '    npm run doctor   # ver IP correto',
    '',
    '── Outras ──',
    '  npm run doctor          # testar endpoints CDP',
    '  npm run login -- --cdp auto',
    '  DOCK_USERNAME/PASSWORD no .env → npm run login',
  ].join('\n');
}
