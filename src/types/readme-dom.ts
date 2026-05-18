import type { EndpointExample, EndpointParam, EndpointResponse, HttpMethod } from './endpoint.js';

/** Which high-level sections appear in `.rm-ReferenceMain` (for assertions + debug). */
export interface ReadmeSectionVisibility {
  bodyParamsHeading: boolean;
  headersHeading: boolean;
  queryParamsHeading: boolean;
  /** Response status picker / response block present */
  responsesUi: boolean;
  /** Count of `[role="tablist"]` inside reference main (Try It / samples) */
  tryItTablistCount: number;
}

/** Lightweight capture metrics (crawler + browser). */
export interface ReadmeDomCaptureMeta {
  extractDurationMs?: number;
  fullHtmlBytes?: number;
  referenceMainNodeCount?: number;
  tablistCount?: number;
}

/** Truncated outerHTML per section for offline QA (not for parsing). */
export interface ReadmeSectionHtmlDebug {
  bodyParams?: string;
  headers?: string;
  queryParams?: string;
  responses?: string;
  referenceMain?: string;
}

/** Snapshot of ReadMe API reference page extracted from live DOM (Playwright). */
export interface ReadmeDomSnapshot {
  source: 'playwright-dom';
  pageTitle?: string;
  description?: string;
  breadcrumbs: string[];
  method?: HttpMethod;
  path?: string;
  serverUrl?: string;
  summary?: string;
  bodyParams: EndpointParam[];
  headers: EndpointParam[];
  queryParams: EndpointParam[];
  responses: EndpointResponse[];
  /** One entry per Try It language tab (when collected). */
  tryItSamples: EndpointExample[];
  /** Section presence in the live reference column (DOM). */
  sectionVisibility?: ReadmeSectionVisibility;
  /** Optional HTML snippets for debug export (capped in browser). */
  sectionHtmlDebug?: ReadmeSectionHtmlDebug;
  /** Automatic checks: non-empty when expected UI was visible but extraction failed. */
  domAssertionViolations?: string[];
  /** Timing / size metrics for regression + performance debugging. */
  captureMeta?: ReadmeDomCaptureMeta;
}
