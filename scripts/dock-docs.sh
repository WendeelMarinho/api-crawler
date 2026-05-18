#!/usr/bin/env bash
# Menu interativo — Ubuntu VPS headless (sem interface gráfica)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

run_cmd() {
  local profile="$1"
  shift
  ./scripts/run-with-memory.sh "$profile" -- "$@"
}

pause() {
  read -r -p "Pressione Enter para continuar..."
}

show_header() {
  clear
  echo "=============================================="
  echo "  Dock Docs Extractor"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "=============================================="
  echo ""
}

main_menu() {
  while true; do
    show_header
    echo " 1) Login (headless — credenciais no .env)"
    echo " 2) Crawl documentação"
    echo " 3) Rebuild (raw-html → json, sem browser)"
    echo " 4) Reorganizar pastas (sidebar)"
    echo " 5) Audit de qualidade"
    echo " 6) Export RAG"
    echo " 7) Testar e-mail SMTP"
    echo " 8) Doctor (diagnóstico)"
    echo " 9) Limpar storage (--keep-auth)"
    echo " 0) Sair"
    echo ""
    read -r -p "Opção: " opt
    case "$opt" in
      1) run_cmd default login; pause ;;
      2) run_cmd crawl crawl; pause ;;
      3) run_cmd rebuild rebuild; pause ;;
      4) run_cmd default reorganize; pause ;;
      5) run_cmd default audit; pause ;;
      6) run_cmd export export; pause ;;
      7) run_cmd default test-email; pause ;;
      8) run_cmd default doctor; pause ;;
      9) run_cmd default clean -- --keep-auth; pause ;;
      0) exit 0 ;;
      *) echo "Opção inválida"; sleep 1 ;;
    esac
  done
}

main_menu
