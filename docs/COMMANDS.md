# Comandos e ambiente

## Scripts npm

| Script | Comando real | Memória sugerida (32GB VPS) |
|--------|--------------|-----------------------------|
| `npm run login` | `tsx src/index.ts login` | padrão |
| `npm run crawl` | `NODE_OPTIONS='--max-old-space-size=8192' tsx … crawl` | **8–16 GB** (ajustar) |
| `npm run reorganize` | `tsx … reorganize` | 2–4 GB |
| `npm run rebuild` | `tsx … rebuild` | 4–8 GB (~35 min para 1071 páginas) |
| `npm run export` | `NODE_OPTIONS='--max-old-space-size=8192' tsx … export` | 8 GB |
| `npm run doctor` | `tsx … doctor` | padrão |
| `npm run clean` | `tsx … clean` | — |

> **Nota:** `package.json` hoje só define `max-old-space-size` no `crawl`. Roadmap inclui centralizar em `.env` (`NODE_MAX_OLD_SPACE_MB`).

## Variáveis `.env` (existentes)

Ver `.env.example`. Principais:

- `DOCK_*` — URL e credenciais
- `CRAWL_*` — concurrency, delay, timeout, `CRAWL_DISCOVER_MODE=sidebar`, `CRAWL_MAX_PAGES=0`
- `LOG_LEVEL`

## Variáveis planejadas (não implementadas)

Ver [SMTP-NOTIFICATIONS-SPEC.md](./SMTP-NOTIFICATIONS-SPEC.md) e [VPS-AND-MEMORY.md](./VPS-AND-MEMORY.md).

## WSL

- Login: `bash scripts/wsl-login.sh`
- Chrome debug Windows: porta 9222
- Crawl headless no WSL após sessão salva

## VPS (futuro)

- Login headless nativo (sem CDP)
- systemd timer ou cron
- `.env` em `/opt/dock-docs-extractor/.env`
