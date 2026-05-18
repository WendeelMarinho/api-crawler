# Qualidade da extração

## Definição de “bem documentado” (alvo)

Para cada endpoint, o JSON ideal deve ter:

| Campo | Alvo |
|-------|------|
| `title` | Nome humano do endpoint (sidebar ou H1 da operação) |
| `endpoint.method` / `path` | Corretos |
| `endpoint.summary` / `description` | Texto da doc, não placeholder |
| `endpoint.pathParams` / `queryParams` / `bodyParams` | Lista completa com tipos e required |
| `endpoint.responses` | Pelo menos 200 + erros relevantes |
| `examples` / `codeBlocks` | curl ou snippet executável |
| `breadcrumbs` | Cadeia igual à sidebar |
| `markdown` | Corpo legível para RAG |

## Score atual (estimativa)

| Critério | ~% |
|----------|---:|
| URL + method + path corretos | 85 |
| Pasta / breadcrumbs | 80 |
| Título correto | 30 |
| Params completos | 25 |
| Exemplos curl úteis | 40 |
| Sem placeholders loading | 50 |

## Melhorias planejadas (código)

### Fase A — sem re-crawl (HTML existente)

1. **Title resolver** — ordem: OpenAPI interceptado → heading operação → `navigation-flat.title` → slug URL.
2. **Sanitize placeholders** — marcar `extractionIncomplete: true` se detectar `Retrieving recent requests` / `Loading`.
3. **Comando `npm run audit`** — relatório HTML/JSON com contagens por domínio.
4. **Enriquecer via navigation-flat** — `title`, `pathTitles` quando DOM falhou.

### Fase B — próximo crawl (quando autorizado)

1. **ReadMe wait strategy** — `waitForFunction` até params renderizarem; timeout 15–30s em endpoints.
2. **Scroll + expand** — acordeões da sidebar e seções da página.
3. **Retry por página** — se QA detectar incompleto, re-fila só essa URL.
4. **Intercept OpenAPI** — merge spec na página se disponível.

### Fase C — operação

1. SMTP progress (ver spec SMTP).
2. Memória 8–16 GB configurável.
3. VPS cron + healthcheck.

## QA automático (proposto)

```bash
npm run audit   # a implementar
```

Saída sugerida: `storage/reports/audit-{date}.json` + opcional e-mail resumo.

Regras:

- `title` matches `/^(200|Loading)/i` → fail
- `bodyParams[].name` contains `Retrieving` → fail
- `endpoint.responses.length === 0` → warn
