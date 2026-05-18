# Layout de dados (`storage/`)

## Árvore

```
storage/
├── auth/session.json              # Playwright storageState (gitignored)
├── navigation/
│   ├── navigation-tree.json       # hierarquia por domínio (v1-banking, …)
│   ├── navigation-flat.json       # 1987 itens com url, navPath, pathTitles
│   ├── crawl-summary.json
│   └── architecture-map.json      # pode ser enorme; gerado no crawl
├── raw-html/{domain}/{docId}.html # cache bruto (docId = md5 url 12 chars)
├── markdown/{domain}/{section}/…  # espelha json
├── json/{domain}/{section}/…      # SemanticDocument
├── chunks/{domain}/…              # por crawl original (paths podem estar flat)
├── openapi/                       # specs interceptadas
├── graphql/
├── embeddings/                    # saída do export RAG
├── debug-extraction/              # opcional: debug por docId (EXTRACTION_DEBUG_ARTIFACTS=true)
└── screenshots/                   # erros de crawl
```

## Nome de arquivo JSON

Padrão atual (após rebuild):

```
{page-slug-ou-method-path}-{docId}.json
```

Exemplo: `post-financing-simulations-cae-01bbdbabf017.json`

- `docId` = `urlHash(url)` (12 hex) — garante unicidade.
- Pastas intermediárias = `navPath` sem domínio e sem leaf (ex.: `account-creation/`).

## Campos JSON importantes

```json
{
  "id": "05c7ce0a983e",
  "title": "200OK",
  "domain": "v1-banking",
  "subcategory": "account-debt-stage",
  "type": "endpoint",
  "url": "https://developers.dock.tech/v1-banking/reference/post-api-...",
  "breadcrumbs": ["Banking", "Account debt stage", "..."],
  "endpoint": { "method": "POST", "path": "/api/accounts/...", ... },
  "markdown": "...",
  "contentHash": "..."
}
```

`storageSegments` pode não estar serializado no JSON antigo; o path em disco reflete a seção.

Documentos gerados após crawl com **DOM-first** incluem com frequência `extractionSignals` (ex.: `domSourceOfTruth`, `domViolations`, `qualityScore`) e `codeBlocks[].exampleType` (`try-it`, `schema`, `snippet`).

## Índice

`storage/json/index.json` — gerado no rebuild (lista id, title, domain, url, path).
