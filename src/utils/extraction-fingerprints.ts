import { createHash } from 'node:crypto';
import type { EndpointParam, EndpointResponse } from '../types/endpoint.js';
import type { CodeBlock } from '../types/document.js';

export function normalizeFingerprintText(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim().toLowerCase();
}

export function fingerprintParam(p: Pick<EndpointParam, 'name' | 'in' | 'description' | 'type'>): string {
  const n = normalizeFingerprintText(p.name);
  const d = p.description ? normalizeFingerprintText(p.description).slice(0, 200) : '';
  return createHash('sha256')
    .update(`${p.in}|${n}|${p.type ?? ''}|${d}`, 'utf8')
    .digest('hex')
    .slice(0, 20);
}

export function fingerprintResponse(r: Pick<EndpointResponse, 'statusCode' | 'description'>): string {
  const desc = r.description ? normalizeFingerprintText(r.description).slice(0, 240) : '';
  return createHash('sha256')
    .update(`${r.statusCode}|${desc}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

export function fingerprintCodeBlock(b: Pick<CodeBlock, 'language' | 'code' | 'label' | 'exampleType'>): string {
  const head = normalizeFingerprintText(b.code).slice(0, 400);
  return createHash('sha256')
    .update(`${b.exampleType ?? 'snippet'}|${b.language}|${b.label ?? ''}|${head}`, 'utf8')
    .digest('hex')
    .slice(0, 20);
}

/** Dedupe params by semantic fingerprint (keeps first). */
export function dedupeParamsByFingerprint<T extends Pick<EndpointParam, 'name' | 'in' | 'description' | 'type'>>(
  params: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of params) {
    const fp = fingerprintParam(p);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(p);
  }
  return out;
}

export function dedupeResponsesByFingerprint<T extends Pick<EndpointResponse, 'statusCode' | 'description'>>(
  responses: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of responses) {
    const fp = fingerprintResponse(r);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(r);
  }
  return out.sort((a, b) => a.statusCode.localeCompare(b.statusCode));
}

export function dedupeCodeBlocksByFingerprint(blocks: CodeBlock[]): CodeBlock[] {
  const seen = new Set<string>();
  const out: CodeBlock[] = [];
  for (const b of blocks) {
    const fp = fingerprintCodeBlock(b);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(b);
  }
  return out;
}
