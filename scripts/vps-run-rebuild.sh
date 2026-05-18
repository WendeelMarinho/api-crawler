#!/usr/bin/env bash
# Rebuild em tmux (útil após copiar raw-html ou crawl parcial).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SESSION="${REBUILD_TMUX_SESSION:-api-crawler-rebuild}"
LOG="logs/rebuild-$(date +%Y%m%d-%H%M%S).log"

mkdir -p logs storage
chown -R 1001:1001 storage logs 2>/dev/null || true

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Sessão '$SESSION' já existe. tmux attach -t $SESSION"
  exit 1
fi

tmux new-session -d -s "$SESSION" \
  "cd '$ROOT' && docker compose run --rm rebuild 2>&1 | tee -a '$LOG'; echo; read -p 'Enter para fechar' _"

echo "Rebuild em tmux: $SESSION | log: $LOG"
echo "  tmux attach -t $SESSION"
