# Deploy na VPS (Ubuntu headless)

## Requisitos

- Ubuntu 22.04+ (sem interface gráfica)
- Docker + Docker Compose
- 32 GB RAM (alocação sugerida abaixo)

## Memória

| Job | Node heap | Container limit |
|-----|-----------|-----------------|
| crawl | 16 GB | 20 GB |
| rebuild | 8 GB | 12 GB |
| export | 8 GB | 12 GB |

## Setup rápido

```bash
git clone <repo> /opt/dock-docs-extractor
cd /opt/dock-docs-extractor
cp .env.example .env
# Editar .env: DOCK_*, SMTP_*
docker compose build
docker compose run --rm login
```

## Menu interativo

```bash
docker compose run --rm app
# ou no host:
chmod +x scripts/dock-docs.sh
./scripts/dock-docs.sh
```

## Jobs pontuais

```bash
docker compose run --rm rebuild
docker compose run --rm crawl
```

## Cron (exemplo — rebuild semanal, sem crawl automático)

```cron
0 4 * * 0 cd /opt/dock-docs-extractor && docker compose run --rm rebuild >> logs/cron.log 2>&1
```

## Login headless (VPS — sem WSL/CDP)

O portal Dock usa **ReadMe** (`dash.readme.com`). O formulário padrão envia *magic link* por e-mail; o crawler clica em **"Log in with Password"** e usa `DOCK_USERNAME` + `DOCK_PASSWORD` do `.env`.

```bash
docker compose run --rm login
# sessão salva em storage/auth/session.json
```

## Testar SMTP

```bash
docker compose run --rm test-email
# ou: npm run test-email
# ou: docker compose run --rm app  # opção 7 no menu
```
