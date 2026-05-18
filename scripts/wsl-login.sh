#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== dock-docs-extractor — login WSL ==="
echo ""

# 1) CDP local (Chrome no WSL)
if curl -sf --connect-timeout 2 http://127.0.0.1:9222/json/version &>/dev/null; then
  echo "✓ Chrome CDP detectado no WSL (127.0.0.1:9222)"
  npm run login -- --cdp http://127.0.0.1:9222
  exit $?
fi

# 2) Gateway (Windows host real — não usa 8.8.8.8 do resolv.conf)
GW="$(ip -4 route show default 2>/dev/null | awk '{print $3}' | head -1 || true)"
if [ -n "$GW" ] && [ "$GW" != "8.8.8.8" ]; then
  if curl -sf --connect-timeout 2 "http://${GW}:9222/json/version" &>/dev/null; then
    echo "✓ Chrome CDP detectado no Windows (${GW}:9222)"
    npm run login -- --cdp "http://${GW}:9222"
    exit $?
  fi
fi

# 3) Auto-detect via Node
echo "Nenhum CDP ativo. Tentando auto-detect..."
if npm run login -- --cdp auto 2>/dev/null; then
  exit 0
fi

echo ""
echo "Nenhum Chrome com debugging encontrado."
echo ""
echo "── Opção A: Chrome no WSL (recomendado se você tem GUI no WSL) ──"
echo "  npm run chrome:debug"
echo "  # faça login na janela que abrir"
echo "  npm run login -- --cdp http://127.0.0.1:9222"
echo ""
echo "── Opção B: Chrome no Windows ──"
echo "  No PowerShell:"
echo '    & "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `'
echo '      --remote-debugging-port=9222 `'
echo '      --user-data-dir="$env:TEMP\chrome-dock-debug"'
echo ""
if [ -n "$GW" ]; then
  echo "  No WSL:"
  echo "    npm run login -- --cdp http://${GW}:9222"
fi
echo ""
echo "── Diagnóstico ──"
echo "  npm run doctor"
exit 1
