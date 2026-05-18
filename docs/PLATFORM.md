# Como a plataforma funciona

## Visão geral

O **api-crawler** é um pipeline em Node.js que:

1. Autentica no portal de documentação (Playwright).
2. Percorre a sidebar e extrai cada página.
3. Salva HTML bruto + JSON semântico + Markdown.
4. Após o crawl, **automaticamente** reprocessa e organiza os JSON.
5. Envia **e-mails** em marcos importantes (início, 50%, erro, fim).

## Fluxo automático (produção na VPS)

```text
npm run login
    → storage/auth/session.json

npm run crawl
    → [e-mail] Crawl iniciado
    → Playwright visita cada URL da fila
    → Salva storage/raw-html/{domain}/{id}.html
    → Salva storage/json/... (durante o crawl)
    → [e-mail] Crawl 50% (progresso)
    → [e-mail] Crawl concluído

    → Pipeline pós-crawl (automático se POST_CRAWL_AUTO_EXPORT=true)
        → rebuild: reparse HTML → JSON com qualidade (títulos, flags)
        → reorganize: colhe sidebar + pastas hierárquicas
        → [e-mail] Pipeline concluído (+ log resumido)

storage/json/v1-banking/account-creation/post-....json
```

## E-mails (quando recebe)

| Momento | Assunto típico |
|---------|----------------|
| Início do crawl | `[Dock] Iniciado: crawl` |
| 50% do crawl | `[Dock] crawl 50%` |
| Fim do crawl | `[Dock] Concluído: crawl` |
| Início pós-crawl | `[Dock] Iniciado: pipeline-pós-crawl` |
| Fim pós-crawl | `[Dock] Concluído: pipeline-pós-crawl` |
| Erro em qualquer etapa | `[Dock] ERRO: ...` |

Não há e-mail a cada 10% — apenas **50%** + eventos de ciclo de vida.

## Comandos manuais

| Comando | Uso |
|---------|-----|
| `npm run menu` | Menu interativo (VPS/Docker) |
| `npm run rebuild` | Só reparse HTML → JSON (sem browser) |
| `npm run reorganize` | Só reorganizar pastas + sidebar |
| `npm run audit` | Relatório de qualidade |
| `npm run export` | RAG / embeddings (opcional) |

## Docker na VPS (Ubuntu, sem GUI)

```bash
docker compose build
docker compose run --rm login
docker compose run --rm crawl    # crawl + pipeline + e-mails
docker compose run --rm app      # menu interativo
```

## O que NÃO vai para o Git

- `.env` (credenciais Dock + SMTP)
- `storage/` (dados extraídos)
- `node_modules/`, `dist/`

## Variáveis-chave

```env
POST_CRAWL_AUTO_EXPORT=true   # rebuild + reorganize após crawl
NOTIFY_PROGRESS_EVERY_PCT=50
NODE_MAX_OLD_SPACE_CRAWL=16384
```
