# START HERE — próxima AI

## O que é este projeto

Extrator semântico da documentação autenticada da Dock Tech (`https://developers.dock.tech`). Usa **Playwright** (DOM hidratado em `/reference/`) + **Cheerio** (fallback / rebuild / páginas não-reference) para JSON/Markdown estruturados para RAG ou copilots.

**Não é** um scraper HTML burro: há pipeline **DOM-first** para API Reference, asserts, score ponderado, dedupe semântico e export RAG.

## Regras importantes (usuário)

1. **Não rodar crawl de novo** até o usuário autorizar — melhorias devem funcionar em `rebuild` / `reorganize` / código offline quando possível.
2. **Não commitar** `.env`, `storage/auth/`, credenciais SMTP.
3. Mudanças focadas — sem refatoração ampla não solicitada.
4. VPS terá **32 GB RAM** — alocar memória generosa para Node (`NODE_OPTIONS`).

## Estado em uma frase

Crawl completo (~1071 HTML em cache) → **pipeline automático** (rebuild + reorganize) → JSON em pastas por seção; e-mails a cada **50%**, início, erro e conclusão.

## Comandos que importam

```bash
npm run login          # sessão Playwright
npm run crawl          # NÃO rodar sem OK do usuário
npm run reorganize     # colhe sidebar + move arquivos
npm run rebuild        # reparse raw-html → json/md (sem browser; não repete DOM-first)
npm run export         # RAG (opcional)
npm run audit          # relatório de qualidade
npm run test           # unitários (tsx --test)
npm run doctor         # diagnóstico WSL/CDP
```

## Onde está o código novo (organização)

| Área | Caminho |
|------|---------|
| Harvest sidebar | `src/navigation/nav-harvester.ts`, `nav-merge.ts`, `nav-path.ts` |
| Reorganizar storage | `src/organizers/storage-organizer.ts` |
| Rebuild sem crawl | `src/organizers/cache-rebuilder.ts` |
| DOM-first ReadMe | `src/extractors/readme-dom-extractor.ts`, `readme-endpoint-from-dom.ts`, `readme-dom-assertions.ts` |
| Dedupe / fingerprints | `src/utils/extraction-fingerprints.ts` |
| Score ponderado | `src/quality/weighted-quality-score.ts` |
| Paths hierárquicos | `src/utils/path-builder.ts` |
| Filenames legíveis | `src/utils/slugify.ts` (`filenameFromUrlAndTitle` + `doc.id`) |

## Próximo trabalho (aprovado pelo usuário, não implementado ainda)

Ver [ROADMAP.md](./ROADMAP.md). **Na VPS:** [VPS-AI-PLAYBOOK.md](./VPS-AI-PLAYBOOK.md) (setup) · [VPS-AI-PROMPT.md](./VPS-AI-PROMPT.md) (prompt para colar na IA).
