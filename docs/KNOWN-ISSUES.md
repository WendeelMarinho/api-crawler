# Problemas conhecidos

## 1. Título do documento = aba de resposta HTTP

**Sintoma:** `"title": "200OK"` ou `"200"` em vez do nome do endpoint.

**Causa:** ReadMe mostra primeiro a aba de response; `html-extractor` pega o heading visível errado.

**Correção planejada:** `endpoint-extractor` ou seletor `.rm-Endpoint` / título da operação para `title`; fallback para slug da URL.

**Sem crawl:** melhora parcial via `rebuild` se o título estiver em outro nó do HTML cache.

---

## 2. Lazy-load do API Explorer

**Sintoma:**

- `"Retrieving recent requests…"` em `bodyParams` / tabelas
- `"LoadingLoading…"` em `codeBlocks`
- `responses: []` vazio

**Causa:** Playwright capturou HTML antes do JS do ReadMe terminar (400ms wait atual).

**Correção definitiva:** aumentar wait, `waitForSelector` em params, scroll, retry — **requer re-crawl** para HTML novo.

**Sem crawl:** rebuild **não** recupera dados que nunca estiveram no HTML.

---

## 3. Cobertura da sidebar

- Nav flat: **1987** URLs
- Páginas crawleadas/salvas: **~1054–1071**

Muitas entradas da sidebar são duplicatas, âncoras ou páginas não enfileiradas no modo `sidebar`.

---

## 4. Páginas na raiz do domínio

~240 JSON em `storage/json/v1-banking/*.json` (sem subpasta) — URL não encontrada em `navigation-flat` ou `navPath` de profundidade 1.

---

## 5. Domínios legados

Pastas `banking/`, `dock-one/` (sem `v1-`) podem ter 1 arquivo residual do bootstrap inicial. Produto atual usa `v1-*`.

---

## 6. Chunks desalinhados

`storage/chunks/` pode estar na estrutura flat antiga; não atualizado no `reorganize`. RAG export lê JSON, não chunks em disco.

---

## 7. architecture-map.json

Arquivo pode exceder dezenas de MB; crawl com >2000 páginas pula o grafo em memória.

---

## Exemplo de referência (qualidade média)

Arquivo: `storage/json/v1-banking/account-debt-stage/post-api-accounts-account-id-curing-stage-05c7ce0a983e.json`

- Bom: `endpoint.method`, `path`, `summary`, pasta, breadcrumbs
- Ruim: `title`, params incompletos, codeBlocks loading
