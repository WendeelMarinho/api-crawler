# Especificação SMTP (rascunho — aguardando usuário)

## Objetivo

Enviar e-mails com status do crawler e jobs relacionados:

- Início do job
- Progresso (ex.: 50%)
- Erro fatal / falha de sessão
- Conclusão com resumo (páginas salvas, falhas, duração)

## Eventos propostos

| Evento | Quando | Conteúdo mínimo |
|--------|--------|-----------------|
| `job.started` | crawl / rebuild / reorganize | tipo, timestamp, config (concurrency, max pages) |
| `job.progress` | a cada N% ou N páginas | % , saved/total, URL atual, ETA opcional |
| `job.warning` | retry, sessão quase expirando | mensagem |
| `job.failed` | exceção não recuperada | stack resumido, última URL |
| `job.completed` | fim OK | stats, paths, link para log |

## Variáveis `.env` (proposta)

```env
SMTP_ENABLED=true
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false          # true para 465
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Dock Extractor <noreply@example.com>"
SMTP_TO=seu@email.com      # pode ser lista separada por vírgula

NOTIFY_ON_START=true
NOTIFY_ON_PROGRESS=true
NOTIFY_PROGRESS_EVERY_PCT=10   # ou NOTIFY_PROGRESS_EVERY_N=100
NOTIFY_ON_ERROR=true
NOTIFY_ON_COMPLETE=true
```

## Implementação técnica (planejada)

- Lib: **nodemailer** (leve, padrão Node)
- Módulo: `src/notifications/email-notifier.ts`
- Hook em: `DockDocsCrawler.run()`, `rebuildFromRawHtmlCache()`, CLI `reorganize`
- Não logar `SMTP_PASS`

## Perguntas abertas

Ver seção "Perguntas ao usuário" em `00-START-HERE.md` / resposta na conversa.

Preencher este arquivo após respostas e implementar.
