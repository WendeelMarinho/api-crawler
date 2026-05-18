# Prompt completo — IA na VPS (após `git clone`)

Use este arquivo depois que o repositório já estiver clonado na VPS.  
**Não** inclua senhas no prompt — a IA deve pedir ou ler o `.env` local.

Documentação de apoio (ler no repositório):

- [VPS-AI-PLAYBOOK.md](./VPS-AI-PLAYBOOK.md) — fases, troubleshooting, checklist
- [00-START-HERE.md](./00-START-HERE.md) — regras do projeto
- [PROJECT-STATE.md](./PROJECT-STATE.md) — métricas e estado atual
- [KNOWN-ISSUES.md](./KNOWN-ISSUES.md) — limitações conhecidas

---

## Como usar

1. Na VPS, o usuário já executou:
   ```bash
   git clone git@github.com:WendeelMarinho/api-crawler.git
   cd api-crawler
   ```
2. (Opcional) O usuário copiou `storage/` da máquina de desenvolvimento via `rsync`/`scp`.
3. Abra uma sessão de IA **dentro** de `~/api-crawler` (ou o caminho do clone).
4. Copie **todo** o bloco abaixo (da linha `---INÍCIO DO PROMPT---` até `---FIM DO PROMPT---`) e cole como primeira mensagem.
5. Se faltar credencial, responda à IA quando ela pedir — nunca cole senhas no chat se o repositório for compartilhado; prefira editar `.env` diretamente na VPS.

---

## Prompt (copiar e colar)

```text
---INÍCIO DO PROMPT---

Você está em uma VPS Ubuntu headless com ~32 GB RAM. O repositório **api-crawler** (Dock Tech documentation extractor) já foi clonado com `git clone git@github.com:WendeelMarinho/api-crawler.git`. Sua missão é deixar a aplicação **pronta para rodar** e **implementar as melhorias** descritas abaixo — executando comandos você mesma, sem pedir ao usuário para rodar passos que você pode fazer.

## Contexto do projeto

- **O que faz:** extrai documentação autenticada da Dock Tech (Playwright + Cheerio/ReadMe) e gera JSON/Markdown semânticos em `storage/` para RAG.
- **Stack:** Node.js, TypeScript, Playwright, Docker Compose.
- **Repo:** pasta atual do clone (`api-crawler`).
- **Docs obrigatórias no repo:** leia `docs/VPS-AI-PLAYBOOK.md`, `docs/00-START-HERE.md`, `docs/KNOWN-ISSUES.md` antes de alterar código.

## Regras invioláveis

1. **NÃO** rodar `npm run crawl` nem `docker compose run --rm crawl` sem autorização **explícita** do usuário na conversa.
2. **NÃO** commitar `.env`, senhas, `storage/auth/`, nem fazer `git push --force`.
3. Credenciais **somente** em `.env` com `chmod 600`.
4. VPS = **sempre headless** (`CRAWL_HEADLESS=true`). Não usar `--headed` nem CDP.
5. E-mail de progresso do crawl: **apenas a cada 50%** (`NOTIFY_PROGRESS_EVERY_PCT=50`) — não alterar para 10% sem pedido.
6. Mudanças de código **focadas** — sem refatoração ampla não solicitada.
7. Preferir **Docker** (`docker compose`) para login, rebuild e testes; usar npm no host só se Docker não estiver disponível.

## O que você deve fazer (ordem)

### Etapa 1 — Diagnóstico do ambiente

Execute e registre no relatório final:

- `pwd`, `uname -a`, `free -h`, `df -h`
- `docker --version`, `docker compose version`, `git --version`
- Confirmar `package.json` na raiz do clone
- Contar dados existentes:
  - `find storage/raw-html -name '*.html' 2>/dev/null | wc -l`
  - `find storage/json -name '*.json' ! -name index.json 2>/dev/null | wc -l`
  - `test -f storage/auth/session.json && echo OK || echo MISSING`

### Etapa 2 — Configurar `.env`

- Se não existir: `cp .env.example .env` e `chmod 600 .env`
- Preencher (pedir ao usuário **só** o que faltar):
  - `DOCK_USERNAME`, `DOCK_PASSWORD`
  - `SMTP_USER`, `SMTP_PASS`, `SMTP_TO` (Hostinger: host `smtp.hostinger.com`, porta `465`, `SMTP_SECURE=true`)
- Garantir estes valores para VPS 32 GB:

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

### Etapa 3 — Build

```bash
docker compose build
```

Se Docker falhar, instalar deps no host: `npm ci`, `npx playwright install chromium`, `npx playwright install-deps chromium`, `npm run build`.

### Etapa 4 — Login e e-mail

```bash
docker compose run --rm login
# ou: npm run login
```

Sucesso = `storage/auth/session.json` criado.

Testar SMTP:

```bash
npm run test-email
# ou menu docker: docker compose run --rm app → opção test-email
```

### Etapa 5 — Qualidade nos dados existentes (SEM crawl)

**Se** existir `storage/raw-html/` com HTML (~1000+ arquivos):

```bash
docker compose run --rm rebuild
# ou: npm run rebuild
```

Isso reparseia HTML em cache → JSON/Markdown (30–45 min típico). Não abre browser para páginas novas.

Depois:

```bash
npm run audit
npm run audit -- --email   # opcional
```

Metas pós-rebuild: reduzir `bad_title`, aumentar `extractionQuality: complete`, manter **1054+** JSON válidos.

Se JSON estiver em pastas flat (sem hierarquia):

```bash
npm run reorganize
```

### Etapa 6 — Validar estrutura

Verificar:

- JSON em `storage/json/v1-banking/{secao}/...`
- `storage/navigation/navigation-flat.json` (~1987 itens se storage completo)
- Um JSON de exemplo com `title`, `extractionQuality`, `url` legíveis (não só `200OK`)

### Etapa 7 — Implementar melhorias no código

Implementar no repositório (commits locais; **perguntar ao usuário antes de `git push`**):

**Prioridade 1 — qualidade (sem novo crawl):**

| # | Tarefa | Arquivos |
|---|--------|----------|
| 1.1 | Melhorar `resolveDocumentTitle` — priorizar título da sidebar (`pathTitles`) | `src/quality/document-enricher.ts` |
| 1.2 | Persistir `storageSegments` e `extractionQuality` no JSON exportado | `src/exporters/json-exporter.ts` |
| 1.3 | `npm run audit --fail-on-threshold` (exit 1 se >N% partial) | `src/audit/quality-audit.ts`, `src/index.ts` |
| 1.4 | Após `rebuild`, atualizar `storage/json/index.json` com paths hierárquicos | `src/organizers/cache-rebuilder.ts` |

**Prioridade 2 — crawl (só código; NÃO executar crawl):**

| # | Tarefa | Arquivos |
|---|--------|----------|
| 2.1 | Wait strategy ReadMe: esperar params sem placeholder | `src/crawler/crawler.ts` |
| 2.2 | Aumentar wait pós-goto + scroll leve | `src/crawler/crawler.ts` |
| 2.3 | Enfileirar URLs de `navigation-flat.json` ainda não crawleadas | `src/crawler/crawler.ts`, discovery |
| 2.4 | Revisar crawl incremental por `contentHash` | crawler existente |

**Prioridade 3 — operação VPS:**

| # | Tarefa |
|---|--------|
| 3.1 | Criar `scripts/vps-setup.sh` (fases .env + build + login + test-email) |
| 3.2 | Serviço `audit` one-shot no `docker-compose.yml` |
| 3.3 | `scripts/healthcheck.sh` (sessão, storage, smtp) |
| 3.4 | README — seção “Deploy VPS” |

Após cada melhoria P1: rodar `npm run rebuild` (se houver raw-html) e `npm run audit` para medir impacto.

### Etapa 8 — Cron (opcional)

Propor ao usuário (não ativar crawl sem OK) exemplo em `/etc/cron.d/api-crawler`:

```cron
# Rebuild semanal (sem browser):
# 0 4 * * 0 root cd /caminho/api-crawler && docker compose run --rm rebuild >> /var/log/api-crawler.log 2>&1
```

## Cenários

- **Com `storage/` copiado da WSL:** login (se sessão expirada) → rebuild → audit → melhorias P1 → validar.
- **VPS limpa (sem storage):** criar dirs vazios, login, test-email, implementar melhorias, documentar que crawl completo aguarda autorização do usuário.

## Comandos de referência

```bash
docker compose run --rm login
docker compose run --rm rebuild
docker compose run --rm app          # menu interativo
./scripts/dock-docs.sh               # menu no host
npm run test-email
npm run audit
npm run reorganize
# PROIBIDO sem OK explícito:
# npm run crawl
# docker compose run --rm crawl
```

## Relatório final obrigatório

Ao terminar, entregue ao usuário:

1. Caminho do projeto na VPS
2. Resultado de `test-email` (sim/não + erro se falhou)
3. Contagens: HTML em raw-html, JSON gerados, resumo do último `audit` (complete/partial/failed, bad_title)
4. Lista de melhorias implementadas (arquivos alterados)
5. O que **não** foi feito e por quê (ex.: crawl aguardando autorização)
6. Comando exato para o usuário rodar crawl quando autorizar
7. Sugestão de cron (se aplicável)
8. Se fez commits: hashes/mensagens; perguntar se deve fazer `git push`

## Critérios de “pronto para rodar”

- [ ] `docker compose build` OK
- [ ] `.env` completo (Dock + SMTP)
- [ ] `npm run test-email` OK
- [ ] `storage/auth/session.json` válido
- [ ] `storage/raw-html/` verificado OU plano documentado para crawl futuro
- [ ] `npm run rebuild` executado (se havia HTML)
- [ ] `npm run audit` executado
- [ ] Melhorias P1 implementadas e testadas
- [ ] Melhorias P2 codificadas (crawl não executado)
- [ ] Relatório final entregue

Comece pela Etapa 1 agora. Execute os comandos você mesma. Não pare na metade — só peça ao usuário credenciais que faltarem no `.env` ou confirmação explícita para crawl completo.

---FIM DO PROMPT---
```

---

## Variante curta (se o contexto for limitado)

```text
VPS Ubuntu 32GB, repo api-crawler já clonado. Siga docs/VPS-AI-PLAYBOOK.md: .env (Dock+SMTP) → docker compose build → login → test-email → rebuild (se raw-html) → audit → implementar melhorias P1–P3 do playbook → NÃO rodar crawl sem OK explícito → relatório final com métricas e comandos. Execute tudo você mesma.
```

---

## Após a IA concluir (usuário)

```bash
# Atualizar código se houver push
git pull

# Crawl completo (só quando quiser)
docker compose run --rm crawl

# Menu
docker compose run --rm app
```
