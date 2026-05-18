/// <reference lib="dom" />
import type { Locator, Page } from 'playwright';
import fs from 'fs-extra';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { STORAGE_PATHS } from '../config/constants.js';
import type { EndpointDefinition, EndpointExample, EndpointParam, HttpMethod } from '../types/endpoint.js';
import type { ReadmeDomSnapshot, ReadmeSectionHtmlDebug, ReadmeSectionVisibility } from '../types/readme-dom.js';
import { HTTP_METHODS } from '../config/constants.js';
import { dedupeParamsByFingerprint, dedupeResponsesByFingerprint } from '../utils/extraction-fingerprints.js';
import { resolvePathParamsFromTemplate } from '../utils/path-params-from-template.js';

const HTTP_SET = new Set<string>(HTTP_METHODS);

export function isDockReadmeReferencePage(url: string, baseUrl: string): boolean {
  try {
    const u = new URL(url);
    const b = new URL(baseUrl);
    if (u.hostname !== b.hostname) return false;
    return /\/reference\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Expand accordions / collapsed panels inside API reference (not global nav). */
export async function expandReadmeReferenceUi(page: Page, maxClicks = 45): Promise<void> {
  const root = page.locator('.rm-ReferenceMain, [class*="ReferenceMain"]').first();
  if (!(await root.count())) return;

  const toggles = root.locator(
    '[aria-expanded="false"][class*="Accordion"], [aria-expanded="false"][class*="Toggle"], button[aria-expanded="false"]',
  );
  const n = await toggles.count();
  for (let i = 0; i < Math.min(n, maxClicks); i++) {
    try {
      const el = toggles.nth(i);
      if (!(await el.isVisible({ timeout: 400 }).catch(() => false))) continue;
      await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
      await el.click({ timeout: 800, force: true }).catch(() => undefined);
      await page.waitForTimeout(120);
    } catch {
      // non-fatal
    }
  }
}

export async function waitForReadmeParamsHydrated(
  page: Page,
  timeoutMs: number,
  settleMs: number,
): Promise<void> {
  await page.waitForTimeout(Math.min(Math.max(settleMs, 2000), 6000));
  await page
    .waitForFunction(
      `() => {
        const containers = document.querySelectorAll(
          '.rm-ParamContainer, [class*="ParamContainer"]'
        );
        if (containers.length === 0) return true;
        for (const el of containers) {
          const t = (el.textContent || '').toLowerCase();
          if (t.includes('retrieving recent requests') || t.includes('loadingloading')) return false;
        }
        return true;
      }`,
      { timeout: Math.min(timeoutMs, 25_000) },
    )
    .catch(() => undefined);
}

/** Visible Try It / code sample snippet inside reference column. */
async function readTryItVisibleCode(root: Locator): Promise<string> {
  const code =
    (await root
      .locator(
        '.rm-CodeSample pre, .rm-CodeSnippet pre, [class*="CodeSample"] pre, [class*="TryIt"] pre',
      )
      .first()
      .innerText()
      .catch(() => '')) || '';
  return code.replace(/\u00a0/g, ' ').trim();
}

function hashSnippetUtf8(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 16);
}

/** Click each Try-It / code-sample language tab and capture visible snippet (DOM-final). */
export async function collectTryItLanguageSamples(page: Page): Promise<EndpointExample[]> {
  const samples: EndpointExample[] = [];
  const root = page.locator('.rm-ReferenceMain').first();
  if (!(await root.count())) return samples;

  const tablists = root.locator('[role="tablist"]');
  const listCount = await tablists.count();
  for (let li = 0; li < listCount; li++) {
    const tabs = tablists.nth(li).locator('[role="tab"]');
    const n = await tabs.count();
    if (n < 2 || n > 12) continue;

    let previousSnippet = '';

    for (let i = 0; i < n; i++) {
      if (samples.length >= 15) return finalizeTryItSamples(samples);
      try {
        const tab = tabs.nth(i);
        const tabLabel = (await tab.innerText().catch(() => '')).trim();
        if (!tabLabel || tabLabel.length > 24) continue;
        await tab.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined);
        const beforeClick = await readTryItVisibleCode(root);
        await tab.click({ timeout: 1500 }).catch(() => undefined);

        let settled = beforeClick;
        for (let w = 0; w < 36; w++) {
          await page.waitForTimeout(85);
          settled = await readTryItVisibleCode(root);
          const looksReady = settled.length >= 12 && !/loadingloading|^loading$/i.test(settled);
          if (!looksReady) continue;
          if (i === 0 || settled !== beforeClick || settled !== previousSnippet) break;
        }

        const cleaned = settled;
        if (cleaned.length < 12 || /loadingloading|^loading$/i.test(cleaned)) continue;

        const lang = /^curl\b/i.test(cleaned)
          ? 'bash'
          : /^<\?php/i.test(cleaned)
            ? 'php'
            : /^import |^const |^let |^require\(/m.test(cleaned)
              ? 'javascript'
              : /^def |^import [a-z]/m.test(cleaned)
                ? 'python'
                : tabLabel.toLowerCase().replace(/\s+/g, '-');

        const snippetHash = hashSnippetUtf8(cleaned);
        logger.debug('try_it_tab_sample', {
          tablistIndex: li,
          tabIndex: i,
          sourceTab: tabLabel,
          language: lang,
          bytes: cleaned.length,
          snippetHash,
          changedFromPrev: i > 0 ? cleaned !== previousSnippet : true,
        });

        samples.push({
          language: lang,
          code: cleaned,
          label: `Try It · ${tabLabel}`,
          sourceTab: tabLabel,
          snippetHash,
          exampleType: 'try-it',
        });
        previousSnippet = cleaned;
      } catch {
        // skip tab
      }
    }
  }

  return finalizeTryItSamples(samples);
}

function finalizeTryItSamples(samples: EndpointExample[]): EndpointExample[] {
  return dedupeSamples(samples).map((s) => ({
    ...s,
    snippetHash: s.snippetHash ?? hashSnippetUtf8(s.code),
  }));
}

function dedupeSamples(samples: EndpointExample[]): EndpointExample[] {
  const seen = new Set<string>();
  return samples.filter((s) => {
    const k =
      s.snippetHash != null
        ? `${s.language}:${s.snippetHash}`
        : `${s.language}:${s.code.slice(0, 120)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function prepareReadmeReferencePage(
  page: Page,
  options: { delayMs: number; timeoutMs: number },
): Promise<void> {
  await expandReadmeReferenceUi(page);
  await waitForReadmeParamsHydrated(page, options.timeoutMs, options.delayMs * 5);
  await page.evaluate('window.scrollTo(0, document.body.scrollHeight)').catch(() => undefined);
  await page.waitForTimeout(400);
  await page.evaluate('window.scrollTo(0, 0)').catch(() => undefined);
  await page.waitForTimeout(200);
}

export async function extractReadmeDomSnapshot(page: Page): Promise<ReadmeDomSnapshot> {
  const raw = (await page.evaluate(() => {
    const norm = (s: string | null | undefined) =>
      (s || '')
        .replace(/\s+/g, ' ')
        .replace(/\u00a0/g, ' ')
        .trim();

    const refMain = document.querySelector('.rm-ReferenceMain');
    const scope = refMain ?? document;

    const pickMethod = (): string | undefined => {
      const badge =
        scope.querySelector('.rm-APIMethod')?.textContent?.trim().toUpperCase() ||
        document.querySelector('.rm-APIMethod')?.textContent?.trim().toUpperCase();
      if (badge && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(badge)) return badge;
      return undefined;
    };

    const pickPath = (): string | undefined => {
      const el =
        (scope.querySelector('[data-testid="serverurl"]') as HTMLElement | null) ||
        (document.querySelector('[data-testid="serverurl"]') as HTMLElement | null);
      const title = el?.getAttribute('title')?.trim();
      if (title) {
        try {
          return new URL(title.replace(/<!--\s*-->/g, '')).pathname || undefined;
        } catch {
          const m = title.match(/(\/[\w{}/.:_-]+)/);
          return m?.[1];
        }
      }
      const line =
        scope.querySelector('.rm-APIPath')?.textContent?.trim() ||
        document.querySelector('.rm-APIPath')?.textContent?.trim();
      const m2 = line?.match(/(\/[\w{}/.:_-]+)/);
      return m2?.[1];
    };

    const serverUrl = (): string | undefined => {
      const el =
        (scope.querySelector('[data-testid="serverurl"]') as HTMLElement | null) ||
        (document.querySelector('[data-testid="serverurl"]') as HTMLElement | null);
      const t = el?.getAttribute('title')?.trim();
      if (t?.startsWith('http')) return t.replace(/<!--\s*-->/g, '');
      const tx = norm(el?.textContent);
      return tx.startsWith('http') ? tx.split(/\s/)[0] : undefined;
    };

    const pageTitle = norm(document.querySelector('title')?.textContent);

    const breadcrumbs: string[] = [];
    document.querySelectorAll('.rm-Breadcrumbs a, [class*="Breadcrumb"] a, nav[aria-label="breadcrumb"] a').forEach((a) => {
      const t = norm(a.textContent);
      if (t && !breadcrumbs.includes(t)) breadcrumbs.push(t);
    });

    const descriptionParts: string[] = [];
    document
      .querySelectorAll('.rm-APIHeader .rm-Markdown p, header .rm-Markdown[data-testid="RDMD"] p')
      .forEach((p) => {
        const t = norm(p.textContent);
        if (t && !/^200\s*ok?$/i.test(t)) descriptionParts.push(t);
      });
    document.querySelectorAll('header .rm-Markdown blockquote, .rm-APIHeader blockquote').forEach((q) => {
      const t = norm(q.textContent);
      if (t) descriptionParts.push(t);
    });
    const meta = norm(document.querySelector('meta[name="description"]')?.getAttribute('content'));
    let description = descriptionParts.join('\n\n');
    if (!description && meta.length > 40) description = meta;

    const isActuallyVisible = (el: Element | null): boolean => {
      if (!el || !(el as HTMLElement).isConnected) return false;
      let cur: Element | null = el;
      while (cur && cur !== document.body) {
        if (!scope.contains(cur) && cur !== scope) break;
        const st = window.getComputedStyle(cur as HTMLElement);
        if (st.display === 'none' || st.visibility === 'hidden' || st.contentVisibility === 'hidden')
          return false;
        const op = parseFloat(st.opacity);
        if (Number.isFinite(op) && op < 0.04) return false;
        if (cur.getAttribute('aria-hidden') === 'true') return false;
        cur = cur.parentElement;
      }
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width >= 1 && r.height >= 1;
    };

    const findSectionHeadingElement = (labels: string[]): Element | null => {
      const tried = new Set<Element>();
      const groups: string[] = [
        '[class*="APISectionHeader-heading"]',
        '[class*="SectionHeading"]',
        'header h2',
        'header h3',
        '[role="heading"][aria-level="2"]',
        '[role="heading"][aria-level="3"]',
      ];
      for (const sel of groups) {
        const nl = scope.querySelectorAll(sel);
        for (let i = 0; i < nl.length; i++) {
          const h = nl.item(i);
          if (!h || tried.has(h)) continue;
          tried.add(h);
          const t = norm(h.textContent).toLowerCase();
          if (!t) continue;
          const hit = labels.some((kw) => t === kw || t.startsWith(kw) || (kw.length >= 8 && t.includes(kw)));
          if (!hit) continue;
          if (!isActuallyVisible(h)) continue;
          return h;
        }
      }
      return null;
    };

    const findSectionContentRoot = (labels: string[]): Element | null => {
      const h = findSectionHeadingElement(labels);
      if (!h) return null;
      const hdr = h.closest('header');
      let sib: Element | null = hdr?.nextElementSibling ?? h.nextElementSibling;
      let steps = 0;
      while (sib && steps++ < 48) {
        if (!scope.contains(sib)) break;
        const cn = typeof (sib as HTMLElement).className === 'string' ? (sib as HTMLElement).className : '';
        if (sib.matches('[class*="ParamContainer"]') || cn.includes('ParamContainer')) {
          if (sib.matches('[class*="ParamContainer"]')) return sib;
          const innerPc = sib.querySelector('[class*="ParamContainer"]');
          if (innerPc && scope.contains(innerPc)) return innerPc as Element;
        }
        if (sib.tagName === 'HEADER') break;
        const sub = sib.querySelector(':scope > [class*="APISectionHeader-heading"], :scope > header');
        if (sub && !sub.contains(h)) break;
        sib = sib.nextElementSibling;
      }
      const wrap = h.closest('[class*="APISection"], [class*="ApiSection"], section');
      if (wrap && scope.contains(wrap)) {
        const inner = wrap.querySelector('[class*="ParamContainer"]');
        if (inner && scope.contains(inner) && h.compareDocumentPosition(inner) & Node.DOCUMENT_POSITION_FOLLOWING)
          return inner as Element;
      }
      return null;
    };

    const BODY_SECTION_LABELS = [
      'body params',
      'body parameters',
      'request body',
      'corpo da requisição',
      'corpo',
    ];
    const HEADER_SECTION_LABELS = ['headers', 'cabeçalho', 'cabecalho'];
    const QUERY_SECTION_LABELS = [
      'query params',
      'query parameters',
      'parâmetros de consulta',
      'parâmetros de query',
      'query string',
    ];

    const parseParams = (root: Element | null, paramIn: string): Record<string, unknown>[] => {
      if (!root) return [];
      const out: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      const seenEl = new WeakSet<Element>();
      const fieldSelectors = [
        '.form-group.field',
        '[class*="form-group"][class*="field"]',
        '[class*="FormGroup"][class*="field"]',
        'fieldset [class*="field"]',
      ];
      for (const fsel of fieldSelectors) {
        root.querySelectorAll(fsel).forEach((field) => {
          if (seenEl.has(field)) return;
          if (!isActuallyVisible(field)) return;
          if (
            !field.querySelector(
              '[class*="Param-header"], [class*="Param-name"], [data-param-name], [class*="param-name"]',
            )
          )
            return;
          const inp = field.querySelector('input[id], select[id], textarea[id]') as HTMLInputElement | null;
          const fid = inp?.id || '';
          let name = fid.split('_').pop() || '';
          if (!name) {
            name = norm(
              field.querySelector('[class*="Param-name"], [data-param-name]')?.textContent,
            );
          }
          if (!name || /retrieving|loadingloading/i.test(name)) return;
          if (seen.has(name)) return;
          seen.add(name);
          seenEl.add(field);
          const type = norm(field.querySelector('[class*="Param-type"]')?.textContent);
          const required = !!field.querySelector('[class*="Param-required"]');
          const desc = norm(field.querySelector('.Param-description p, .field-description p')?.textContent);
          const def = inp?.getAttribute('placeholder')?.trim();
          out.push({ name, type, required, description: desc || undefined, default: def, in: paramIn });
        });
      }
      return out;
    };

    const bodyContainer = findSectionContentRoot(BODY_SECTION_LABELS);
    const headersContainer = findSectionContentRoot(HEADER_SECTION_LABELS);
    const queryContainer = findSectionContentRoot(QUERY_SECTION_LABELS);

    const bodyParams = parseParams(bodyContainer, 'body');
    const headers = parseParams(headersContainer, 'header');
    const queryParams = parseParams(queryContainer, 'query');

    const hasSectionForLabels = (labels: string[]) => findSectionHeadingElement(labels) !== null;

    const clip = (el: Element | null | undefined): string | undefined => {
      if (!el) return undefined;
      const html = el.outerHTML;
      if (!html) return undefined;
      const max = 400000;
      return html.length > max ? `${html.slice(0, max)}\n<!-- truncated -->` : html;
    };

    const responsesPicker = scope.querySelector('[class*="APIResponseSchemaPicker"]');
    const tryItTablistCount = scope.querySelectorAll('[role="tablist"]').length;

    const sectionVisibility = {
      bodyParamsHeading: hasSectionForLabels(BODY_SECTION_LABELS),
      headersHeading: hasSectionForLabels(HEADER_SECTION_LABELS),
      queryParamsHeading: hasSectionForLabels(QUERY_SECTION_LABELS),
      responsesUi:
        !!responsesPicker || scope.querySelector('[class*="APIResponseSchemaPicker-option"]') !== null,
      tryItTablistCount,
    };

    const sectionHtmlDebug = {
      bodyParams: clip(bodyContainer ?? undefined),
      headers: clip(headersContainer ?? undefined),
      queryParams: clip(queryContainer ?? undefined),
      responses: clip(responsesPicker),
      referenceMain: clip(refMain ?? undefined),
    };
    const responses: { statusCode: string; description?: string }[] = [];
    const seenCodes = new Set<string>();
    scope.querySelectorAll('[class*="APIResponseSchemaPicker-option"]').forEach((opt) => {
      if (!isActuallyVisible(opt)) return;
      let code: string | undefined;
      opt.querySelectorAll('[aria-label]').forEach((el) => {
        const lab = el.getAttribute('aria-label')?.trim();
        if (lab && /^\d{3}$/.test(lab)) code = lab;
      });
      const labelText = norm(opt.querySelector('[class*="APIResponseSchemaPicker-label"]')?.textContent);
      const desc = norm(opt.querySelector('[class*="APIResponseSchemaPicker-description"]')?.textContent) || labelText;
      if (!code) {
        const m = labelText.match(/\b(\d{3})\b/);
        if (m) code = m[1];
        else if (/^OK$/i.test(desc)) code = '200';
        else if (/bad request/i.test(desc)) code = '400';
        else if (/forbidden/i.test(desc)) code = '403';
        else if (/not found/i.test(desc)) code = '404';
      }
      if (!code || seenCodes.has(code)) return;
      seenCodes.add(code);
      responses.push({ statusCode: code, description: desc || undefined });
    });
    responses.sort((a, b) => a.statusCode.localeCompare(b.statusCode));

    return {
      pageTitle,
      description,
      breadcrumbs,
      method: pickMethod(),
      path: pickPath(),
      serverUrl: serverUrl(),
      summary: pageTitle,
      bodyParams,
      headers,
      queryParams,
      responses,
      sectionVisibility,
      sectionHtmlDebug,
    };
  })) as {
    pageTitle: string;
    description: string;
    breadcrumbs: string[];
    method?: string;
    path?: string;
    serverUrl?: string;
    summary: string;
    bodyParams: unknown[];
    headers: unknown[];
    queryParams: unknown[];
    responses: { statusCode: string; description?: string }[];
    sectionVisibility: ReadmeSectionVisibility;
    sectionHtmlDebug: ReadmeSectionHtmlDebug;
  };

  const method = raw.method && HTTP_SET.has(raw.method) ? (raw.method as HttpMethod) : undefined;

  return {
    source: 'playwright-dom',
    pageTitle: raw.pageTitle || undefined,
    description: raw.description || undefined,
    breadcrumbs: Array.isArray(raw.breadcrumbs) ? raw.breadcrumbs : [],
    method,
    path: raw.path || undefined,
    serverUrl: raw.serverUrl || undefined,
    summary: raw.summary || raw.pageTitle || undefined,
    bodyParams: dedupeParamsByFingerprint((raw.bodyParams as unknown as EndpointParam[]) ?? []),
    headers: dedupeParamsByFingerprint((raw.headers as unknown as EndpointParam[]) ?? []),
    queryParams: dedupeParamsByFingerprint((raw.queryParams as unknown as EndpointParam[]) ?? []),
    responses: dedupeResponsesByFingerprint((raw.responses as ReadmeDomSnapshot['responses']) ?? []),
    tryItSamples: [],
    sectionVisibility: raw.sectionVisibility,
    sectionHtmlDebug: raw.sectionHtmlDebug,
  };
}

export function mergeEndpointWithReadmeDom(
  cheerioEp: EndpointDefinition | undefined,
  dom: ReadmeDomSnapshot,
): EndpointDefinition | undefined {
  const method = dom.method ?? cheerioEp?.method;
  const path = dom.path ?? cheerioEp?.path;
  if (!method || !path) return cheerioEp;

  const base: EndpointDefinition = cheerioEp ?? {
    method,
    path,
    summary: dom.summary,
    description: dom.description,
    headers: [],
    queryParams: [],
    pathParams: [],
    bodyParams: [],
    responses: [],
    authRequired: true,
    examples: [],
    tags: [],
  };

  const bodyParams = dom.bodyParams.length > 0 ? dom.bodyParams : base.bodyParams;
  const headers = dom.headers.length > 0 ? dom.headers : base.headers;
  const queryParams = dom.queryParams.length > 0 ? dom.queryParams : base.queryParams;
  const responses = dom.responses.length > 0 ? dom.responses : base.responses;

  let description = base.description;
  if (dom.description && (dom.description.length > (description?.length ?? 0))) {
    description = dom.description;
  }
  if (dom.serverUrl && description && !description.includes(dom.serverUrl)) {
    description = `${description}\n\nBase URL: ${dom.serverUrl}`;
  } else if (dom.serverUrl && !description) {
    description = `Base URL: ${dom.serverUrl}`;
  }

  const exampleByLang = new Map<string, EndpointExample>();
  for (const ex of dom.tryItSamples) {
    if (ex.code?.trim()) exampleByLang.set(ex.language, ex);
  }
  for (const ex of base.examples) {
    if (!exampleByLang.has(ex.language)) exampleByLang.set(ex.language, ex);
  }
  const examples = [...exampleByLang.values()];

  const mergedHeaders = headers;
  const pathParams = /\{[\w.-]+\}/.test(path) ? resolvePathParamsFromTemplate(path) : base.pathParams;
  return {
    ...base,
    method,
    path,
    summary: dom.summary ?? base.summary,
    description,
    bodyParams,
    headers: mergedHeaders,
    queryParams,
    pathParams,
    responses,
    examples,
    authRequired:
      base.authRequired ||
      mergedHeaders.some((h) => /authorization/i.test(h.name)) ||
      dom.tryItSamples.some((e) => /authorization/i.test(e.code)),
  };
}

export async function saveReadmeExtractionDebugArtifacts(
  page: Page,
  docId: string,
  snapshot: ReadmeDomSnapshot | undefined,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;
  try {
    const safeId = docId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const dir = path.join(STORAGE_PATHS.extractionDebug, safeId);
    await fs.ensureDir(dir);

    const html = await page.content();
    await fs.writeFile(path.join(dir, 'full.html'), html, 'utf8');
    await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true });

    if (snapshot?.sectionHtmlDebug) {
      const { sectionHtmlDebug: sh } = snapshot;
      if (sh.bodyParams) await fs.writeFile(path.join(dir, 'body-params.html'), sh.bodyParams, 'utf8');
      if (sh.headers) await fs.writeFile(path.join(dir, 'headers.html'), sh.headers, 'utf8');
      if (sh.queryParams) await fs.writeFile(path.join(dir, 'query-params.html'), sh.queryParams, 'utf8');
      if (sh.responses) await fs.writeFile(path.join(dir, 'responses.html'), sh.responses, 'utf8');
      if (sh.referenceMain) {
        await fs.writeFile(path.join(dir, 'reference-main.html'), sh.referenceMain, 'utf8');
      }
    }

    if (snapshot) {
      await fs.writeJson(path.join(dir, 'body-params.json'), snapshot.bodyParams, { spaces: 2 });
      await fs.writeJson(path.join(dir, 'headers.json'), snapshot.headers, { spaces: 2 });
      await fs.writeJson(path.join(dir, 'query-params.json'), snapshot.queryParams, { spaces: 2 });
      await fs.writeJson(path.join(dir, 'responses.json'), snapshot.responses, { spaces: 2 });
      await fs.writeJson(path.join(dir, 'code-examples.json'), snapshot.tryItSamples, { spaces: 2 });
      await fs.writeJson(
        path.join(dir, 'extraction-meta.json'),
        {
          pageTitle: snapshot.pageTitle,
          method: snapshot.method,
          path: snapshot.path,
          breadcrumbs: snapshot.breadcrumbs,
          sectionVisibility: snapshot.sectionVisibility,
          domAssertionViolations: snapshot.domAssertionViolations,
          captureMeta: snapshot.captureMeta,
        },
        { spaces: 2 },
      );
    }

    logger.debug(`Extraction debug (DOM-first): ${dir}`);
  } catch (e) {
    logger.warn('Extraction debug save failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
