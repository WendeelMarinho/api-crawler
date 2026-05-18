import type { SemanticDocument } from '../types/document.js';

export type ExtractionGrade = 'excellent' | 'good' | 'partial' | 'poor' | 'broken';

export interface WeightedQualityScore {
  /** 0–100 */
  score: number;
  grade: ExtractionGrade;
  breakdown: Record<string, number>;
}

type ScoreInput = Pick<
  SemanticDocument,
  'type' | 'endpoint' | 'breadcrumbs' | 'title' | 'codeBlocks' | 'extractionSignals'
>;

/**
 * Weighted score for DOM-first docs (endpoint-centric). Complements legacy `extractionQuality`.
 */
export function computeWeightedExtractionScore(doc: ScoreInput): WeightedQualityScore {
  const breakdown: Record<string, number> = {};
  let total = 0;
  let max = 0;

  const add = (key: string, w: number, ok: boolean, partial?: number) => {
    max += w;
    const v = ok ? w : partial !== undefined ? partial * w : 0;
    breakdown[key] = Math.round(v);
    total += v;
  };

  const ep = doc.endpoint;
  const sig = doc.extractionSignals;

  if (doc.type === 'endpoint' && ep) {
    add('method_path', 18, Boolean(ep.method && ep.path));
    add('summary', 6, Boolean(ep.summary?.trim() || doc.title?.trim()));
    add('body_params', 16, ep.bodyParams.length > 0, ep.method === 'GET' ? 1 : 0);
    add('headers', 8, ep.headers.length > 0);
    add('responses', 12, ep.responses.length > 0);
    add('examples', 12, ep.examples.length > 0 || (doc.codeBlocks?.length ?? 0) > 0);
    add('breadcrumbs', 6, (doc.breadcrumbs?.length ?? 0) >= 2);
    add('dom_signals', 10, Boolean(sig?.domExtraction));
    add('assertions_clean', 12, !(sig?.domViolations?.length));
  } else {
    add('content', 40, Boolean(doc.title?.trim() && (doc.codeBlocks?.length ?? 0) + (doc.breadcrumbs?.length ?? 0) > 0));
    add('breadcrumbs', 20, (doc.breadcrumbs?.length ?? 0) >= 1);
    add('signals', 20, Boolean(sig?.domExtraction));
    add('assertions', 20, !(sig?.domViolations?.length));
  }

  const score = max > 0 ? Math.round((total / max) * 100) : 0;
  let grade: ExtractionGrade = 'poor';
  if (score >= 92) grade = 'excellent';
  else if (score >= 78) grade = 'good';
  else if (score >= 55) grade = 'partial';
  else if (score >= 30) grade = 'poor';
  else grade = 'broken';

  if (doc.extractionSignals?.domViolations?.length && grade === 'excellent') grade = 'good';

  return { score, grade, breakdown };
}
