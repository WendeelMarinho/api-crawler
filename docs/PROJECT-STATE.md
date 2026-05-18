# Estado do projeto (maio 2026)

Última atualização: após `npm run reorganize` + `npm run rebuild` (sem novo crawl).

## Métricas atuais (`storage/`)

| Métrica | Valor |
|---------|------:|
| HTML cache (`raw-html/`) | 1071 |
| JSON exportados | 1054 |
| Markdown exportados | 1054 |
| Itens em `navigation-flat.json` | 1987 |
| Domínios com JSON | v1-banking (444), v1-dock-one (282), v1-pier (291), v1-acquiring (37) |

**Lacunas:** 17 HTML sem URL na nav no último rebuild; ~933 links da sidebar nunca foram crawleados (nav > páginas salvas).

## Linha do tempo

1. **Crawl inicial** — ~1071 páginas, sessão WSL via CDP (`npm run login -- --cdp`).
2. **Problemas resolvidos** — SIGSEGV WSL, ENAMETOOLONG, OOM (crawl incremental), export RAG rejeitando JSON.
3. **Organização** — usuário pediu estrutura igual ao site; implementado `reorganize` + paths hierárquicos.
4. **Rebuild** — reparsou `raw-html` com nav harvest; corrigiu colisão de filenames (sufixo `-{docId}`).
5. **Parado aqui** — usuário satisfeito com estrutura; pediu melhorias de qualidade + SMTP + VPS + docs; **sem novo crawl**.

6. **Implementado (sem re-crawl)** — SMTP Hostinger HTML, `npm run audit`, `npm run test-email`, memória 16/8/8 GB, Docker + `scripts/dock-docs.sh`, enrichers de qualidade (`extractionQuality`, títulos). Rodar `npm run rebuild` para aplicar parsers nos 1071 HTML em cache.

## Estrutura de saída (atual)

```
storage/json/v1-banking/
├── account-creation/
│   └── post-accounts-eee965838b37.json
├── simulations/
│   └── post-financing-simulations-cae-01bbdbabf017.json
├── post-v2.json                    # fallback: sem seção na nav
└── ...
```

Cada JSON inclui: `id`, `url`, `domain`, `subcategory`, `storageSegments` (implícito no path), `breadcrumbs`, `endpoint`, `markdown`, etc.

## Sessão de autenticação

- Arquivo: `storage/auth/session.json`
- Login WSL: `scripts/wsl-login.sh` ou `npm run login -- --cdp http://<windows-host>:9222`
- Crawl headless no WSL funciona com sessão válida.

## O que NÃO fazer agora

- `npm run crawl` — usuário pediu explicitamente para não recrawlear até nova autorização.
- Apagar `storage/raw-html/` — é o backup para `npm run rebuild`.
- Commitar secrets (SMTP, Dock, sessão).

## Melhorias possíveis sem crawl

| Melhoria | Como |
|----------|------|
| Reparse com waits melhores | Só ajuda no **próximo** crawl; rebuild usa HTML já capturado |
| Título / campos do HTML cache | `rebuild` com parsers melhorados — **sim, sem crawl** |
| QA / audit report | Script offline sobre JSON existente |
| SMTP | Instrumentar crawler + rebuild (eventos) |
| Memória Node | `.env` + `package.json` scripts |

Para lazy-load (`Retrieving recent requests…`), o HTML em cache **já está incompleto** — correção definitiva exige **re-crawl** com waits ou segunda passada no browser.
