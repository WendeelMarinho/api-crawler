const PLACEHOLDER_PATTERNS = [
  /retrieving recent requests/i,
  /loadingloading/i,
  /^loading\.{0,3}$/i,
  /^retrieving/i,
  /^please wait/i,
];

export function isPlaceholderText(text: string | undefined): boolean {
  if (!text || text.length < 2) return true;
  const t = text.trim();
  return PLACEHOLDER_PATTERNS.some((p) => p.test(t));
}

export function contentHasPlaceholders(text: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(text));
}

export function sanitizeText(text: string | undefined): string | undefined {
  if (!text || isPlaceholderText(text)) return undefined;
  return text.trim();
}
