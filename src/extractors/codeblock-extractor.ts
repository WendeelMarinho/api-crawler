import * as cheerio from 'cheerio';
import type { CodeBlock } from '../types/document.js';

export function extractCodeBlocks(html: string): CodeBlock[] {
  const $ = cheerio.load(html);
  const blocks: CodeBlock[] = [];
  const seen = new Set<string>();

  $('pre code, pre, [class*="CodeBlock"]').each((_, el) => {
    const $el = $(el);
    let code = $el.text().trim();
    if (!code || code.length < 2) return;

    const hash = code.slice(0, 100);
    if (seen.has(hash)) return;
    seen.add(hash);

    const classAttr = $el.attr('class') ?? $el.find('code').attr('class') ?? '';
    const langMatch = classAttr.match(/language-(\w+)/);
    const language = langMatch?.[1] ?? detectLanguage(code);

    const label =
      $el.prev('h3, h4, p, .caption').first().text().trim() ||
      $el.closest('[class*="example"]').find('h3, h4').first().text().trim() ||
      undefined;

    blocks.push({ language, code, label: label || undefined, exampleType: 'snippet' });
  });

  return blocks;
}

function detectLanguage(code: string): string {
  const trimmed = code.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith('<')) return 'xml';
  if (/^(curl|wget)\s/i.test(trimmed)) return 'bash';
  if (/^(GET|POST|PUT|PATCH|DELETE)\s+\//m.test(trimmed)) return 'http';
  if (/^(import|export|const|let|function|class)\s/m.test(trimmed)) return 'typescript';
  if (/^def\s|^import\s+\w+$/m.test(trimmed)) return 'python';
  return 'text';
}
