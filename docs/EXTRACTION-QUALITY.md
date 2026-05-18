# Qualidade da extração

## Alvo por documento `endpoint`

| Campo | Fonte na Dock ReadMe `/reference/` |
|-------|-------------------------------------|
| `endpoint.method` / `path` | Badge + URL do servidor (DOM) |
| `endpoint.pathParams` | Placeholders `{nome}` no path (ordenado, dedupe, tipo leve inferido) |
| `endpoint.bodyParams` / `headers` / `queryParams` | Seções por heading + `.rm-ParamContainer` (somente nós visíveis) |
| `endpoint.responses` | Picker de respostas (opções visíveis) |
| `endpoint.examples` | Try It — uma entrada por aba de linguagem |
| `codeBlocks` / `examples` | Try It + schemas JSON (`exampleType`: `try-it` \| `schema` \| `snippet`) |

## Sinais no JSON

- **`extractionSignals`** — `domExtraction`, `domSourceOfTruth`, contagens, `domViolations` (asserts), **`qualityScore`** (`score` 0–100, `grade`, `breakdown`).
- **`extractionQuality`** — legado: `complete` \| `partial` \| `failed` (heurísticas de título/placeholder/missing body).

## Asserts automáticos (`domAssertionViolations`)

Exemplos de violações quando a UI sugere conteúdo mas a extração veio vazia:

- Corpo esperado em POST/PUT/PATCH com seção “Body” visível.
- Abas Try It presentes sem snippets capturados.
- Picker de responses visível sem códigos HTTP.

Use isso para **re-crawl** ou revisão manual da página.

## Rebuild vs crawl

| Comando | Playwright | Endpoint rico (params + Try It) |
|---------|------------|-----------------------------------|
| `crawl` | Sim | Sim (reference) |
| `rebuild` | Não | Não — só Cheerio no HTML em cache |

Para alinhar JSON antigo ao pipeline atual: **crawl de novo** (ou script dedicado futuro).

## QA

```bash
npm run audit
```

Saída em `storage/reports/audit-*.json`.

## Testes unitários

```bash
npm run test
```

Ex.: `path-params-from-template` (ordem e dedupe de `{id}` no path).
