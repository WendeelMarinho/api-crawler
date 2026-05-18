export interface EmailLayoutData {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footer?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailLayout(data: EmailLayoutData): string {
  const subtitle = data.subtitle
    ? `<p style="color:#8ab4e8;font-size:13px;margin:8px 0 0;">${escapeHtml(data.subtitle)}</p>`
    : '';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#0f1419;font-family:system-ui,sans-serif;">
<table width="100%" style="padding:28px 16px;"><tr><td align="center">
<table width="600" style="background:#1a2332;border-radius:12px;border:1px solid #2d3a4f;">
<tr><td style="background:linear-gradient(135deg,#0066cc,#004499);padding:22px 26px;color:#fff;">
<div style="font-size:12px;opacity:0.9;">DOCK DOCS EXTRACTOR</div>
<div style="font-size:18px;font-weight:600;margin-top:6px;">${escapeHtml(data.title)}</div>
${subtitle}
</td></tr>
<tr><td style="padding:26px;color:#e8edf4;font-size:14px;">${data.bodyHtml}</td></tr>
<tr><td style="padding:14px 26px;background:#121a24;color:#7a8fa6;font-size:11px;">${data.footer ?? 'Automático — não responda.'}</td></tr>
</table></td></tr></table></body></html>`;
}

export function statRow(label: string, value: string | number): string {
  return `<tr>
<td style="padding:8px 12px;color:#8ab4e8;border-bottom:1px solid #2d3a4f;">${escapeHtml(label)}</td>
<td style="padding:8px 12px;color:#fff;border-bottom:1px solid #2d3a4f;text-align:right;font-weight:600;">${escapeHtml(String(value))}</td>
</tr>`;
}

export function statsTable(rows: Array<[string, string | number]>): string {
  return `<table width="100%" style="border-collapse:collapse;margin:14px 0;background:#121a24;border-radius:8px;">${rows.map(([l, v]) => statRow(l, v)).join('')}</table>`;
}

export function progressBar(percent: number): string {
  const p = Math.min(100, Math.max(0, percent));
  return `<div style="background:#2d3a4f;border-radius:8px;height:14px;margin:14px 0;overflow:hidden;">
<div style="width:${p}%;height:100%;background:linear-gradient(90deg,#00a86b,#0066cc);"></div>
</div>
<p style="text-align:center;color:#8ab4e8;font-size:13px;margin:4px 0;">${p.toFixed(0)}% concluído</p>`;
}

export function logBlock(text: string): string {
  return `<pre style="background:#0d1117;color:#a8b5c6;padding:14px;border-radius:8px;font-size:11px;white-space:pre-wrap;border:1px solid #2d3a4f;max-height:320px;overflow:auto;">${escapeHtml(text)}</pre>`;
}

export function jobStartedEmail(job: string, details: Record<string, string | number>): string {
  return emailLayout({
    title: `Iniciado: ${job}`,
    subtitle: new Date().toLocaleString('pt-BR'),
    bodyHtml: `<p>Processamento em andamento no servidor.</p>${statsTable(Object.entries(details))}`,
  });
}

export function jobProgressEmail(
  job: string,
  percent: number,
  stats: Record<string, string | number>,
  currentUrl?: string,
): string {
  const urlLine = currentUrl
    ? `<p style="color:#8ab4e8;font-size:12px;word-break:break-all;">Página atual: ${escapeHtml(currentUrl.length > 100 ? `${currentUrl.slice(0, 100)}…` : currentUrl)}</p>`
    : '';
  return emailLayout({
    title: `${job} — ${percent.toFixed(0)}%`,
    bodyHtml: `${progressBar(percent)}${statsTable(Object.entries(stats))}${urlLine}`,
  });
}

export function jobCompletedEmail(
  job: string,
  stats: Record<string, string | number>,
  logTail: string,
): string {
  return emailLayout({
    title: `Concluído: ${job}`,
    subtitle: 'Finalizado com sucesso',
    bodyHtml: `<p>Resumo:</p>${statsTable(Object.entries(stats))}<p style="margin-top:14px;color:#8ab4e8;">Log resumido:</p>${logBlock(logTail)}`,
  });
}

export function jobFailedEmail(job: string, error: string, logTail: string): string {
  return emailLayout({
    title: `Erro: ${job}`,
    subtitle: 'Verifique a sessão e os logs',
    bodyHtml: `<p style="color:#ff7b7b;font-weight:600;">${escapeHtml(error)}</p>${logBlock(logTail)}`,
  });
}

export function auditReportEmail(summary: Record<string, string | number>, highlights: string): string {
  return emailLayout({
    title: 'Relatório de qualidade',
    bodyHtml: `${statsTable(Object.entries(summary))}${logBlock(highlights)}`,
  });
}
