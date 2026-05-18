import type { ReadmeDomSnapshot } from '../types/readme-dom.js';

/**
 * Post-extraction checks: if the live UI showed a section, extraction must not be empty.
 * Violations are diagnostic only (logged + `extractionSignals.domViolations`).
 */
export function computeDomExtractionAssertions(dom: ReadmeDomSnapshot): string[] {
  const v: string[] = [];
  const vis = dom.sectionVisibility;
  if (!vis) return v;

  const needsBody = dom.method && ['POST', 'PUT', 'PATCH'].includes(dom.method);
  if (vis.bodyParamsHeading && needsBody && dom.bodyParams.length === 0) {
    v.push('body_params_section_visible_but_empty');
  }

  if (vis.tryItTablistCount >= 2 && dom.tryItSamples.length === 0) {
    v.push('try_it_tabs_present_but_no_samples');
  }

  if (vis.responsesUi && dom.responses.length === 0) {
    v.push('responses_ui_visible_but_empty');
  }

  if (vis.headersHeading && dom.headers.length === 0) {
    v.push('headers_section_visible_but_empty');
  }

  if (vis.queryParamsHeading && dom.queryParams.length === 0) {
    v.push('query_params_section_visible_but_empty');
  }

  return v;
}
