# Estratégia de e-mail (implementada)

## Provedor

Hostinger SMTP — porta **465** SSL (`SMTP_SECURE=true`).

## Quando envia

| Job | Início | Progresso | Erro | Conclusão |
|-----|--------|-----------|------|-----------|
| **crawl** | Sim | A cada **50%** | Sim | Sim + log resumido |
| **pipeline pós-crawl** | Sim | Não (só início/fim) | Sim | Sim + log |
| **rebuild** (manual) | Sim | 50% | Sim | Sim |
| **reorganize** (manual) | Sim | Não | Sim | Sim |
| **audit** | — | — | — | Só com `--email` |
| **test-email** | Teste manual | — | — | — |

## Conteúdo

- HTML em PT-BR (tema escuro Dock)
- Barra de progresso em atualizações
- Tabela de estatísticas
- Últimas ~40 linhas de `logs/extractor.log`

## Variáveis

Ver `.env.example` — seção `SMTP_*` e `NOTIFY_*`.

## Segurança

- Credenciais **apenas** em `.env` (gitignored)
- Senha nunca aparece nos logs
- Recomendado: trocar senha se foi exposta em chat
