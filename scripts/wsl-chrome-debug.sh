#!/usr/bin/env bash
# Inicia Google Chrome no WSL com remote debugging (porta 9222)
set -euo pipefail

CHROME=""
for bin in google-chrome-stable google-chrome chromium-browser chromium; do
  if command -v "$bin" &>/dev/null; then
    CHROME="$bin"
    break
  fi
done

if [ -z "$CHROME" ]; then
  echo "Chrome/Chromium não encontrado no WSL."
  echo ""
  echo "Instale com:"
  echo "  wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
  echo "  sudo apt install ./google-chrome-stable_current_amd64.deb"
  exit 1
fi

PROFILE_DIR="${CHROME_DEBUG_PROFILE:-/tmp/chrome-dock-debug}"
PORT="${CHROME_DEBUG_PORT:-9222}"

if curl -sf --connect-timeout 1 "http://127.0.0.1:${PORT}/json/version" &>/dev/null; then
  echo "Chrome CDP já está ativo em http://127.0.0.1:${PORT}"
  echo "Faça login em https://developers.dock.tech/reference/inicio se necessário."
  echo ""
  echo "Depois execute:"
  echo "  npm run login -- --cdp http://127.0.0.1:${PORT}"
  exit 0
fi

echo "Iniciando: $CHROME (porta ${PORT})"
echo "Profile: ${PROFILE_DIR}"
echo ""

"$CHROME" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  "https://developers.dock.tech/reference/inicio" \
  &>/dev/null &

sleep 3

if curl -sf --connect-timeout 3 "http://127.0.0.1:${PORT}/json/version" &>/dev/null; then
  echo "✓ CDP ativo: http://127.0.0.1:${PORT}"
  echo ""
  echo "1) Faça login na janela do Chrome que abriu"
  echo "2) Execute:"
  echo "     npm run login -- --cdp http://127.0.0.1:${PORT}"
else
  echo "✗ CDP não respondeu em http://127.0.0.1:${PORT}"
  echo "  Verifique se WSLg está habilitado (wsl --update no Windows)"
  exit 1
fi
