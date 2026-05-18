# Playbook VPS — instruções para a IA

> **Você está na VPS Ubuntu (headless, 32 GB RAM).**  
> O código está em: `git@github.com:WendeelMarinho/api-crawler.git`  
> O usuário só faz `git clone` na VPS — **você** deixa tudo pronto para rodar e implementa as melhorias abaixo.

Leia também: [00-START-HERE.md](./00-START-HERE.md) · [PLATFORM.md](./PLATFORM.md) · [KNOWN-ISSUES.md](./KNOWN-ISSUES.md)

---

## Missão

1. **Preparar** o ambiente (deps, `.env`, Docker, login, dados em `storage/`).
2. **Validar** com `test-email`, `audit` e um job curto de teste se possível.
3. **Implementar** melhorias de código listadas na seção [Melhorias a implementar](#melhorias-a-implementar).
4. **Rodar `npm run rebuild`** nos dados existentes (se houver `storage/raw-html/`) — **não rodar crawl completo** sem autorização explícita do usuário.
5. **Documentar** o que foi feito e o estado final (comandos + métricas do `audit`).

---

## Regras obrigatórias

| Fazer | Não fazer |
|-------|-----------|
| Usar headless (`CRAWL_HEADLESS=true`) | Usar `--headed` ou CDP na VPS |
| Credenciais só em `.env` (chmod 600) | Commitar `.env`, senhas ou `storage/auth/` |
| `git pull` para atualizar código | `git push --force` sem pedido |
| E-mail progresso só a cada **50%** | Alterar para 10% sem pedido |
| Pipeline pós-crawl após crawl | Crawl completo sem OK do usuário |

---

## Fase 0 — Verificar ambiente

Execute e registre o resultado:

```bash
# Onde estamos
pwd
uname -a
free -h
df -h

# Ferramentas
docker --version
docker compose version
node --version 2>/dev/null || echo "Node só via Docker"
git --version

# Repositório
ls -la
# Esperado: estar em .../api-crawler com package.json
```

**Se o repositório ainda não existir:**

```bash
cd ~
git clone git@github.com:WendeelMarinho/api-crawler.git
cd api-crawler
```

---

## Fase 1 — Configurar `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Preencher **obrigatoriamente** (perguntar ao usuário se faltar):

| Variável | Valor esperado |
|----------|----------------|
| `DOCK_USERNAME` | E-mail/login Dock Developers |
| `DOCK_PASSWORD` | Senha Dock |
| `SMTP_USER` | `wendeel@aiuby.com` (Hostinger) |
| `SMTP_PASS` | Senha SMTP (não commitar) |
| `SMTP_TO` | E-mail que recebe notificações |

Manter estes padrões (VPS 32 GB):

```env
CRAWL_HEADLESS=true
CRAWL_CONCURRENCY=5
CRAWL_DELAY_MS=400
NODE_MAX_OLD_SPACE_CRAWL=16384
NODE_MAX_OLD_SPACE_REBUILD=8192
NODE_MAX_OLD_SPACE_EXPORT=8192
POST_CRAWL_AUTO_EXPORT=true
POST_CRAWL_REORGANIZE=true
POST_CRAWL_AUDIT=true
NOTIFY_PROGRESS_EVERY_PCT=50
SMTP_ENABLED=true
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
```

---

## Fase 2 — Build Docker

```bash
cd ~/api-crawler   # ou caminho do clone

docker compose build
```

Instalar deps do Playwright no host **só se** for rodar sem Docker:

```bash
npm ci
npx playwright install chromium
npx playwright install-deps chromium
npm run build
```

**Preferir Docker** para consistência na VPS.

---

## Fase 3 — Dados em `storage/`

### Cenário A — Usuário copiou `storage/` da WSL (recomendado)

Verificar:

```bash
find storage/raw-html -name '*.html' 2>/dev/null | wc -l    # esperado ~1071
find storage/json -name '*.json' ! -name index.json 2>/dev/null | wc -l  # ~1054
test -f storage/auth/session.json && echo "sessão OK" || echo "precisa login"
```

Se `session.json` existir mas estiver expirada → Fase 4 (login).

### Cenário B — VPS limpa (sem storage)

```bash
mkdir -p storage/auth storage/raw-html storage/json storage/markdown storage/navigation logs
```

Será necessário **login + crawl** depois — **só com autorização do usuário**.

---

## Fase 4 — Login (sessão Playwright)

```bash
docker compose run --rm login
# ou: npm run login
```

Sucesso: `storage/auth/session.json` criado.

Testar SMTP:

```bash
docker compose run --rm app
# opção 7 no menu — test-email
# ou:
npm run test-email
```

---

## Fase 5 — Aplicar qualidade nos JSON existentes (SEM crawl)

**Obrigatório se existir `storage/raw-html/`:**

```bash
docker compose run --rm rebuild
# ou: npm run rebuild
```

Duração típica: **30–45 min** para ~1071 HTML.  
Ao terminar: e-mail de pipeline (se SMTP OK).

Depois:

```bash
npm run audit
npm run audit -- --email   # opcional: envia relatório
```

**Metas do audit após rebuild:**

- Reduzir `bad_title` (era ~568 antes do rebuild)
- Preencher `extractionQuality: complete` onde possível
- Manter **1054+** JSON válidos

---

## Fase 6 — Validar estrutura

```bash
# Árvore de exemplo
find storage/json/v1-banking -type d | head -15
ls storage/json/v1-banking/account-creation/ | head -5

# Nav
jq 'length' storage/navigation/navigation-flat.json   # ~1987
jq 'keys' storage/navigation/navigation-tree.json    # v1-banking, etc.

# Um JSON
jq '{title, extractionQuality, url, subcategory}' \
  storage/json/v1-banking/account-debt-stage/post-api-accounts-account-id-curing-stage-*.json 2>/dev/null | head -20
```

Critérios de “pronto para rodar”:

- [ ] `docker compose build` OK
- [ ] `.env` completo (Dock + SMTP)
- [ ] `npm run test-email` OK
- [ ] `storage/auth/session.json` válido
- [ ] `storage/raw-html/` com HTML OU plano documentado para crawl
- [ ] `npm run rebuild` executado (se havia HTML)
- [ ] `npm run audit` executado e relatório em `storage/reports/`
- [ ] JSON em pastas hierárquicas (`v1-banking/secao/arquivo.json`)

---

## Fase 7 — Cron opcional (só configurar, não disparar crawl)

Criar entrada de exemplo para o usuário aprovar:

```bash
# /etc/cron.d/api-crawler — EXEMPLO, não ativar crawl sem OK
# Rebuild semanal (sem browser pesado):
# 0 4 * * 0 root cd /opt/api-crawler && docker compose run --rm rebuild >> /var/log/api-crawler.log 2>&1
```

Documentar no final do seu relatório ao usuário.

---

## Melhorias a implementar

Implementar no código (commits locais; **perguntar antes de push**). Ordem sugerida:

### Prioridade 1 — Qualidade (sem novo crawl)

| # | Tarefa | Arquivos | Critério de pronto |
|---|--------|----------|-------------------|
| 1.1 | Melhorar `resolveDocumentTitle` — priorizar título da sidebar (`pathTitles`) | `src/quality/document-enricher.ts` | Audit: menos `bad_title` |
| 1.2 | Persistir `storageSegments` e `extractionQuality` no JSON exportado | `src/exporters/json-exporter.ts` | Campos presentes no disco |
| 1.3 | Comando `npm run audit --fail-on-threshold` (exit 1 se >N% partial) | `src/audit/quality-audit.ts`, `src/index.ts` | Útil para CI/cron |
| 1.4 | Após `rebuild`, gerar `storage/json/index.json` atualizado | `cache-rebuilder.ts` | Index com paths hierárquicos |

### Prioridade 2 — Crawl (código pronto; **não executar** até autorização)

| # | Tarefa | Arquivos | Notas |
|---|--------|----------|-------|
| 2.1 | Wait strategy ReadMe: esperar params sem placeholder | `src/crawler/crawler.ts` | `waitForFunction` / selector `.rm-ParamContainer` ou similar |
| 2.2 | Aumentar wait pós-goto de 400ms → 2–5s + scroll | `crawler.ts` `crawlPage` | Só afeta **novo** HTML |
| 2.3 | Enfileirar URLs de `navigation-flat.json` ainda não crawleadas | `src/crawler/crawler.ts`, `discovery.ts` | Diff nav vs `raw-html` hashes |
| 2.4 | Crawl incremental: pular URL se `contentHash` igual | Já parcial; revisar `loadExistingHashes` | |

### Prioridade 3 — Operação VPS

| # | Tarefa | Arquivos |
|---|--------|----------|
| 3.1 | Script `scripts/vps-setup.sh` — automatiza fases 1–4 | novo |
| 3.2 | `docker-compose.yml` — serviço `audit` one-shot | `docker-compose.yml` |
| 3.3 | Healthcheck: `scripts/healthcheck.sh` (sessão, storage, smtp) | novo |
| 3.4 | README seção “Deploy VPS” com clone-only | `README.md` |

### Prioridade 4 — Futuro (backlog)

- OpenAPI interceptado → merge em `endpoint` no rebuild
- E-mail diff após crawl (“N novas, M alteradas”)
- API HTTP read-only para consultar JSON por domínio

---

## Fluxo de produção (referência)

```text
git clone → .env → docker compose build → login → test-email
    → [se storage/ da WSL] rebuild → audit
    → [quando autorizado] crawl → pipeline automático → JSON final
```

E-mails esperados no **crawl completo**:

1. Início crawl  
2. Crawl 50%  
3. Fim crawl  
4. Início pipeline pós-crawl  
5. Fim pipeline (+ log)

---

## Comandos rápidos

```bash
# Menu interativo
docker compose run --rm app
# ou: ./scripts/dock-docs.sh

# Jobs isolados
docker compose run --rm login
docker compose run --rm rebuild
docker compose run --rm crawl          # SÓ COM AUTORIZAÇÃO
docker compose run --rm crawl -- --no-post-export

# Host (sem Docker)
npm run menu
npm run rebuild
npm run audit -- --email
npm run test-email
```

---

## Troubleshooting

| Problema | Ação |
|----------|------|
| Login falha | Verificar `DOCK_*` no `.env`; testar credenciais no browser local |
| SMTP falha | Porta 465 + `SMTP_SECURE=true`; senha de app Hostinger |
| `browser closed` / crash | Aumentar `shm_size` no compose (já 4gb); reduzir `CRAWL_CONCURRENCY` |
| OOM no rebuild | `NODE_MAX_OLD_SPACE_REBUILD=8192` ou 12288 |
| JSON flat (sem pastas) | Rodar `npm run reorganize` |
| Títulos ainda `200OK` | Rodar `rebuild`; lazy-load só corrige com novo crawl |
| Sessão expirada | `docker compose run --rm login` |

---

## Relatório final para o usuário

Ao concluir, entregar resumo com:

1. Caminho do projeto na VPS  
2. Resultado de `test-email` (sim/não)  
3. Contagens: HTML, JSON, `audit` (complete/partial/failed)  
4. Melhorias implementadas (lista + arquivos)  
5. O que **não** foi feito e por quê (ex.: crawl aguardando OK)  
6. Comando exato para o usuário rodar crawl quando quiser  
7. Sugestão de cron (se aplicável)

---

## Checklist resumido (copiar/colar)

```
[ ] git clone em ~/api-crawler
[ ] .env configurado (Dock + SMTP, chmod 600)
[ ] docker compose build
[ ] npm run test-email OK
[ ] login OK → session.json
[ ] storage/raw-html verificado (ou documentado ausência)
[ ] npm run rebuild executado
[ ] npm run audit executado
[ ] Melhorias P1 implementadas
[ ] Melhorias P2 codificadas (crawl não executado)
[ ] Relatório final entregue ao usuário
```
