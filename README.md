# api-crawler

Minerador semântico para documentação autenticada (ex.: [Dock Tech](https://developers.dock.tech/reference/inicio)). Transforma portais ReadMe/SPA em JSON e Markdown estruturados — pastas espelhando a sidebar, notificações por e-mail e deploy Docker em VPS headless.

> Repositório: `git@github.com:WendeelMarinho/api-crawler.git`

## O que este sistema faz

Não é um scraper simples. Atua como:

- **Minerador semântico** — extrai título, endpoints, schemas, tabelas, exemplos
- **Extractor DOM-first (ReadMe `/reference/`)** — Playwright expande a UI, lê o DOM hidratado (body params, headers, query, responses, Try It por aba) e monta o `endpoint` a partir da mesma superfície que o humano vê
- **Extractor arquitetural** — mapeia domínios, dependências e relações
- **Parser de domínio** — organiza saída pela hierarquia da sidebar
- **Construtor de knowledge graph** — gera `architecture-map.json`

### O JSON dos endpoints fica “completo”?

Para páginas **API Reference** da Dock (`…/reference/…`) **após um crawl novo** com esta versão:

- O objeto `endpoint` tende a incluir **`method`**, **`path`**, **`pathParams`** (derivados do path `{id}`), **`bodyParams`**, **`headers`**, **`queryParams`**, **`responses`** e **`examples`** (snippets Try It), além de **`extractionSignals`** (contagens, `domSourceOfTruth`, violações de assert opcionais e **`qualityScore`** ponderado).

Limitações honestas: páginas não padronizadas, lazy load que falhou, mudança de layout na Dock ou conteúdo só em PDF/outro host podem ainda deixar campos vazios — use `extractionQuality`, `extractionSignals.domViolations` e `qualityScore` para filtrar ou re-crawlear.

### Outras IAs conseguem codar “sem erros”?

**Não há garantia automática.** O JSON melhora muito a **fidelidade à documentação visual**, mas integração real ainda exige: OAuth/tokens, ambientes (sandbox/prod), regras de negócio, idempotência, paginação e validação do próprio time. Trate o JSON como **fonte primária da doc**, não como contrato executável testado em runtime.

## Stack

Node.js LTS · TypeScript · Playwright · Cheerio · Turndown · Zod · Winston · p-limit · ora · cli-progress

## Documentação interna (handoff AI)

Documentação: **[docs/](./docs/)** — geral: [00-START-HERE.md](./docs/00-START-HERE.md) · **VPS (IA):** [playbook](./docs/VPS-AI-PLAYBOOK.md) · [prompt completo](./docs/VPS-AI-PROMPT.md).

## Instalação

```bash
cd api-crawler
cp .env.example .env
npm install
npm run build
```

## Configuração (`.env`)

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DOCK_BASE_URL` | URL base | `https://developers.dock.tech` |
| `DOCK_DOCS_PATH` | Página inicial | `/reference/inicio` |
| `DOCK_USERNAME` | Login automático (opcional) | — |
| `DOCK_PASSWORD` | Login automático (opcional) | — |
| `CRAWL_CONCURRENCY` | Páginas paralelas | `3` |
| `CRAWL_DELAY_MS` | Delay entre requests | `500` |
| `CRAWL_HEADLESS` | Browser headless | `true` |
| `CRAWL_RESUME` | Retomar fila salva | `false` |
| `MANUAL_LOGIN_TIMEOUT_SEC` | Timeout login manual | `300` |
| `EXTRACTION_DEBUG_ARTIFACTS` | Por página reference: `storage/debug-extraction/{id}/` (HTML, screenshot, JSON por seção, `extraction-meta.json`) | `false` |
| `POST_CRAWL_*` / `NOTIFY_*` | Ver `.env.example` | — |

## Comandos

```bash
# 1. Autenticar (obrigatório na primeira vez)
npm run login                      # headless (credenciais no .env)
bash scripts/wsl-login.sh          # WSL: Chrome no Windows + CDP (recomendado)
npm run login -- --cdp http://172.x.x.x:9222
npm run login -- --import ./session-export.json

# 2. Extrair documentação completa (ao terminar: export JSON automático + e-mail)
npm run crawl
npm run crawl -- --headed
npm run crawl -- --resume          # retomar após falha
npm run crawl -- --no-post-export  # só crawl, sem rebuild/reorganize

# 3. Exportar para RAG
npm run export
npm run export -- --target chromadb
npm run export -- --target qdrant

# 4. Reorganizar / reconstruir (sem recrawl)
npm run reorganize              # colhe sidebar e reorganiza pastas
npm run rebuild                 # reparse storage/raw-html → json/md (sem Playwright; endpoint rich veio do último crawl)

# 5. Testes (unitários)
npm run test

# 6. Limpar dados extraídos
npm run clean
npm run clean -- --keep-auth
```

## Fluxo interno

```
login → session.json
         ↓
crawl → sidebar → navigation-tree.json
     → fila URLs → Playwright + interceptação APIs
     → páginas /reference/: DOM-first (expand UI, tabs Try It, snapshot semântico)
     → parsePage → markdown + json + chunks (+ extractionSignals / qualityScore)
     → architecture-map.json
         ↓
export → embeddings/ (ChromaDB / Qdrant / JSONL)
```

## Estrutura de saída

```
storage/
├── auth/session.json
├── navigation/
│   ├── navigation-tree.json      # árvore hierárquica (sidebar)
│   ├── navigation-flat.json      # lista plana com domínios
│   ├── architecture-map.json     # knowledge graph
│   └── crawl-summary.json
├── markdown/{domain}/*.md        # markdown + frontmatter YAML
├── json/{domain}/*.json          # documento semântico
├── chunks/{domain}/*.json        # chunks para embeddings
├── openapi/                      # specs interceptadas
├── graphql/
├── embeddings/                   # payloads RAG
├── debug-extraction/             # opcional: artefatos por docId (EXTRACTION_DEBUG_ARTIFACTS=true)
└── screenshots/                  # erros de crawl
```

## Exemplo de markdown gerado

```yaml
---
domain: authentication
subcategory: oauth
title: Issue access token
type: endpoint
method: POST
path: /oauth/token
auth_required: true
tags:
  - authentication
  - oauth
---
```

## Exemplo de chunk RAG

```json
{
  "domain": "accounts",
  "section": "account-creation",
  "embedding_hint": "POST /accounts",
  "content": "..."
}
```

## Frameworks detectados

ReadMe · Docusaurus · Mintlify · Redoc · Swagger UI · Stoplight · GitBook

O portal Dock (`developers.dock.tech`) usa **ReadMe** — seletores `.rm-Sidebar` e `.rm-Article` são priorizados.

## Deploy VPS (Ubuntu headless, 32 GB)

Fluxo após `git clone` na VPS — a IA ou você segue [docs/VPS-AI-PLAYBOOK.md](./docs/VPS-AI-PLAYBOOK.md):

```bash
git clone git@github.com:WendeelMarinho/api-crawler.git
cd api-crawler

# Setup automatizado ( .env + build + login + test-email )
./scripts/vps-setup.sh

# Verificar sessão, storage e SMTP
./scripts/healthcheck.sh

# Se copiou storage/ da máquina de desenvolvimento:
docker compose run --rm rebuild
docker compose run --rm audit

# Crawl completo — somente com autorização explícita:
docker compose run --rm crawl
```

Cron sugerido (rebuild semanal, sem browser):

```cron
# /etc/cron.d/api-crawler
0 4 * * 0 root cd /opt/api-crawler && docker compose run --rm rebuild >> /var/log/api-crawler.log 2>&1
```

## Docker

```bash
docker compose run --rm login
docker compose run --rm rebuild
docker compose run --rm audit
docker compose up app
```

Volumes `storage/` e `logs/` são persistidos.

## Segurança

- Credenciais apenas em `.env` (nunca commitadas)
- Tokens, cookies e headers sensíveis redigidos nos logs
- `storage/auth/` no `.gitignore`

## WSL (Windows Subsystem for Linux)

`npm run login -- --headed` **não funciona** na maioria dos ambientes WSL — o Chromium crasha com `SIGSEGV` por falta de servidor gráfico.

**Fluxo recomendado:**

1. No **PowerShell (Windows)**:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\chrome-dock-debug"
```

2. Faça login em https://developers.dock.tech/reference/inicio nesse Chrome.

3. No **WSL**:

```bash
bash scripts/wsl-login.sh
# ou manualmente:
WIN_HOST=$(grep -m1 nameserver /etc/resolv.conf | awk '{print $2}')
npm run login -- --cdp http://$WIN_HOST:9222
```

A sessão é salva em `storage/auth/session.json` e o `npm run crawl` funciona em headless no WSL.

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `SIGSEGV` no login (WSL) | Use `scripts/wsl-login.sh` ou `--cdp` — não use `--headed` |
| Sessão inválida | Repita login via CDP ou `--import` |
| Sidebar vazia | Aumentar timeout; verificar sessão |
| Crawl interrompido | `npm run crawl -- --resume` |
| Rate limit | Reduzir `CRAWL_CONCURRENCY`, aumentar `CRAWL_DELAY_MS` |
| Páginas faltando | Ver `logs/extractor.log` e `storage/screenshots/` |

## Arquitetura do código

```
src/
├── auth/          # login, sessão Playwright
├── crawler/       # fila, discovery, interceptação; pipeline DOM-first em /reference/
├── extractors/    # HTML, sidebar, endpoints, OpenAPI, GraphQL, readme-dom-* (snapshot vivo)
├── parsers/       # semântica, domínios, chunks, hierarquia (parsePage: merge DOM-first)
├── exporters/     # markdown, JSON, RAG, navegação
├── quality/       # enrich, asserts, weighted quality score
├── config/        # env (Zod), schemas
└── utils/         # logger, retry, hash, paths, fingerprints de dedupe
```

## Licença

UNLICENSED — uso interno.
