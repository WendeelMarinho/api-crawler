import fs from 'fs-extra';
import path from 'node:path';
import { STORAGE_PATHS, PROJECT_ROOT } from '../config/constants.js';
import { validateSemanticDocument } from '../config/schemas.js';
import { hydrateStoredDocument } from '../loaders/document-loader.js';
import type { ExtractionQuality } from '../types/quality.js';
import { logger } from '../utils/logger.js';

export interface AuditIssue {
  file: string;
  url: string;
  issues: string[];
  extractionQuality?: ExtractionQuality;
}

export interface AuditReport {
  auditedAt: string;
  totalFiles: number;
  validDocuments: number;
  byQuality: Record<ExtractionQuality, number>;
  byDomain: Record<string, number>;
  issueCounts: Record<string, number>;
  samples: AuditIssue[];
}

const BAD_TITLE = /^(200\s*ok?|200|loading|untitled)$/i;

export async function runQualityAudit(maxSamples = 30): Promise<AuditReport> {
  const byQuality: Record<ExtractionQuality, number> = {
    complete: 0,
    partial: 0,
    failed: 0,
  };
  const byDomain: Record<string, number> = {};
  const issueCounts: Record<string, number> = {};
  const samples: AuditIssue[] = [];
  let totalFiles = 0;
  let validDocuments = 0;

  if (!(await fs.pathExists(STORAGE_PATHS.json))) {
    throw new Error('storage/json não encontrado');
  }

  async function walk(dir: string, domainHint?: string): Promise<void> {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, dir === STORAGE_PATHS.json ? entry.name : domainHint);
        continue;
      }
      if (!entry.name.endsWith('.json') || entry.name === 'index.json') continue;

      totalFiles++;
      const domain = domainHint ?? 'general';
      byDomain[domain] = (byDomain[domain] ?? 0) + 1;

      const raw = (await fs.readJson(abs)) as Record<string, unknown>;
      const normalized = hydrateStoredDocument(raw, { filename: entry.name });
      const result = validateSemanticDocument(normalized);
      if (!result.success) continue;

      validDocuments++;
      const doc = result.data as {
        url: string;
        title: string;
        extractionQuality?: ExtractionQuality;
        content?: string;
        endpoint?: { bodyParams?: { name: string }[] };
      };

      const q = doc.extractionQuality ?? 'partial';
      byQuality[q] = (byQuality[q] ?? 0) + 1;

      const issues: string[] = [];
      if (BAD_TITLE.test(doc.title.trim())) issues.push('bad_title');
      if (/retrieving recent requests|loadingloading/i.test(doc.content ?? '')) {
        issues.push('placeholders');
      }
      if (doc.endpoint?.bodyParams?.some((p) => /retrieving/i.test(p.name))) {
        issues.push('params_placeholder');
      }

      for (const i of issues) {
        issueCounts[i] = (issueCounts[i] ?? 0) + 1;
      }

      if (issues.length > 0 && samples.length < maxSamples) {
        samples.push({
          file: path.relative(PROJECT_ROOT, abs),
          url: doc.url,
          issues,
          extractionQuality: doc.extractionQuality,
        });
      }
    }
  }

  await walk(STORAGE_PATHS.json);

  const report: AuditReport = {
    auditedAt: new Date().toISOString(),
    totalFiles,
    validDocuments,
    byQuality,
    byDomain,
    issueCounts,
    samples,
  };

  const reportsDir = path.join(PROJECT_ROOT, 'storage/reports');
  await fs.ensureDir(reportsDir);
  const outPath = path.join(reportsDir, `audit-${Date.now()}.json`);
  await fs.writeJson(outPath, report, { spaces: 2 });
  logger.info(`Audit report: ${outPath}`);

  return report;
}

export function formatAuditSummary(report: AuditReport): string {
  const lines = [
    `Documentos válidos: ${report.validDocuments}/${report.totalFiles}`,
    `Completos: ${report.byQuality.complete}`,
    `Parciais: ${report.byQuality.partial}`,
    `Falhos: ${report.byQuality.failed}`,
    `Título ruim: ${report.issueCounts.bad_title ?? 0}`,
    `Placeholders: ${report.issueCounts.placeholders ?? 0}`,
  ];
  if (report.samples.length > 0) {
    lines.push('', 'Exemplos:');
    for (const s of report.samples.slice(0, 5)) {
      lines.push(`- ${s.issues.join(', ')} → ${s.url.slice(0, 70)}…`);
    }
  }
  return lines.join('\n');
}
