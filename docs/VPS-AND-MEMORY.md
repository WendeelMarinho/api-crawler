# VPS e memória (32 GB RAM)

## Alocação proposta (a confirmar com usuário)

| Processo | `NODE_OPTIONS` sugerido | Notas |
|----------|-------------------------|--------|
| `crawl` | `--max-old-space-size=16384` (16 GB) | Concorrência 3–5; sobra RAM para Chromium |
| `rebuild` | `8192` (8 GB) | CPU-bound; ~30–40 min / 1071 páginas |
| `export` | `8192` (8 GB) | Carrega todos JSON na RAM |
| `reorganize` | `4096` (4 GB) | Poucas páginas browser (harvest nav) |

Sobra ~8–12 GB para SO + Playwright processes.

## Playwright no Linux

```bash
npx playwright install chromium
npx playwright install-deps chromium
```

Headless nativo — **não precisa CDP** na VPS.

## Cron exemplo (não instalar sem OK)

```cron
# Rebuild semanal (sem crawl) — domingo 04:00
0 4 * * 0 cd /opt/dock-docs-extractor && npm run rebuild >> logs/cron.log 2>&1

# Crawl mensal — quando autorizado
0 3 1 * * cd /opt/dock-docs-extractor && npm run login && npm run crawl >> logs/cron.log 2>&1
```

## Paths na VPS sugeridos

```
/opt/dock-docs-extractor/     # app
/opt/dock-docs-extractor/.env   # secrets (chmod 600)
/opt/dock-docs-extractor/storage/
/opt/dock-docs-extractor/logs/
```

## Variáveis planejadas

```env
NODE_MAX_OLD_SPACE_MB=16384
CRAWL_CONCURRENCY=5
CRAWL_DELAY_MS=400
```

Implementação pendente em `package.json` / `src/config/env.ts`.
