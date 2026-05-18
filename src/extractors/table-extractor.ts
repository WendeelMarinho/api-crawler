import * as cheerio from 'cheerio';
import type { TableData } from '../types/document.js';
import { normalizeWhitespace } from '../utils/cleaner.js';

export function extractTables(html: string): TableData[] {
  const $ = cheerio.load(html);
  const tables: TableData[] = [];

  $('table').each((_, table) => {
    const headers: string[] = [];
    const rows: string[][] = [];

    $(table)
      .find('thead th, tr:first-child th')
      .each((__, th) => {
        headers.push(normalizeWhitespace($(th).text()));
      });

    const bodyRows =
      $(table).find('tbody tr').length > 0
        ? $(table).find('tbody tr')
        : $(table).find('tr').slice(headers.length > 0 ? 1 : 0);

    bodyRows.each((__, row) => {
      const cells = $(row)
        .find('td, th')
        .map((___, cell) => normalizeWhitespace($(cell).text()))
        .get();
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    });

    if (headers.length === 0 && rows.length > 0) {
      tables.push({ headers: rows[0], rows: rows.slice(1) });
    } else if (headers.length > 0 || rows.length > 0) {
      const caption = $(table).find('caption').text().trim() || undefined;
      tables.push({ headers, rows, caption });
    }
  });

  return tables;
}

export function tablesToMarkdown(tables: TableData[]): string {
  return tables
    .map((table) => {
      const lines: string[] = [];
      if (table.caption) lines.push(`**${table.caption}**\n`);

      const headers = table.headers.length > 0 ? table.headers : table.rows[0] ?? [];
      const bodyRows = table.headers.length > 0 ? table.rows : table.rows.slice(1);

      if (headers.length === 0) return '';

      lines.push(`| ${headers.join(' | ')} |`);
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
      for (const row of bodyRows) {
        const padded = headers.map((_, i) => row[i] ?? '');
        lines.push(`| ${padded.join(' | ')} |`);
      }

      return lines.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}
