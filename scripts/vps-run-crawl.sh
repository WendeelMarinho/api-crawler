#!/usr/bin/env bash
# Inicia crawl na VPS em sessão tmux (sobrevive ao fechar SSH).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SESSION="${CRAWL_TMUX_SESSION:-api-crawler}"
LOG="logs/crawl-$(date +%Y%m%d-%H%M%S).log"

mkdir -p logs storage
chown -R 1001:1001 storage logs 2>/dev/null || true

if [[ ! -f storage/auth/session.json ]]; then
  echo "Erro: rode antes: docker compose run --rm login" >&2
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Sessão tmux '$SESSION' já existe."
  echo "  tmux attach -t $SESSION"
  exit 1
fi

echo "Iniciando crawl em tmux (sessão: $SESSION)"
echo "Log: $LOG"
echo ""

tmux new-session -d -s "$SESSION" \
  "cd '$ROOT' && docker compose run --rm crawl 2>&1 | tee -a '$LOG'; echo; echo '=== Crawl finalizado (exit \$?) ==='; read -p 'Enter para fechar' _"

sleep 2
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Crawl rodando em background."
  echo ""
  echo "  Ver ao vivo:    tmux attach -t $SESSION"
  echo "  Sair sem parar: Ctrl+B, depois D"
  echo "  Ver log:        tail -f $LOG"
  echo "  Status tmux:    tmux ls"
else
  echo "Falha ao criar sessão tmux. Últimas linhas do log:" >&2
  tail -20 "$LOG" 2>/dev/null || true
  exit 1
fi
