# Roadmap (aprovado em princípio — aguardando respostas SMTP)

## Concluído (sem re-crawl)

- [x] Documentação `docs/`
- [x] SMTP Hostinger + HTML PT-BR + `npm run test-email`
- [x] Memória NODE 16/8/8 GB + `scripts/run-with-memory.sh`
- [x] Notificações crawl/rebuild/reorganize
- [x] `npm run audit` + `storage/reports/`
- [x] `extractionQuality`, títulos, sanitização placeholders
- [x] Docker + `scripts/dock-docs.sh` (menu interativo)

## Próximo passo recomendado

- [ ] `npm run rebuild` — aplica parsers de qualidade no cache HTML (~35 min)
- [ ] `npm run audit -- --email` — relatório por e-mail após rebuild

## Sprint futuro (quando autorizar crawl)

- [ ] Wait strategy ReadMe (lazy-load)
- [ ] Crawl URLs faltantes da sidebar (~900)
- [ ] Cron VPS para crawl mensal

## Sprint 4 — Próximo crawl (quando usuário autorizar)

- [ ] Wait strategy lazy-load
- [ ] Enfileirar URLs faltantes da `navigation-flat` (~900)
- [ ] Crawl incremental por `contentHash`
- [ ] E-mail com diff “N páginas novas/alteradas”

## Não fazer sem pedido explícito

- Rodar `npm run crawl`
- Push git / commit
- Export RAG para produção
