#!/usr/bin/env bash
# VPS setup — phases 1–4 from docs/VPS-AI-PLAYBOOK.md (no crawl)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> api-crawler VPS setup ($ROOT)"

if [[ ! -f package.json ]]; then
  echo "Erro: execute na raiz do repositório api-crawler" >&2
  exit 1
fi

# Fase 1 — .env
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Criado .env a partir de .env.example"
fi
chmod 600 .env

mkdir -p storage/auth storage/raw-html storage/json storage/markdown storage/navigation storage/reports logs
# Playwright image runs as pwuser (uid 1001)
chown -R 1001:1001 storage logs 2>/dev/null || true

# Garantir padrões VPS no .env (idempotente)
ensure_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

ensure_env CRAWL_HEADLESS true
ensure_env CRAWL_CONCURRENCY 5
ensure_env CRAWL_DELAY_MS 400
ensure_env NODE_MAX_OLD_SPACE_CRAWL 16384
ensure_env NODE_MAX_OLD_SPACE_REBUILD 8192
ensure_env NODE_MAX_OLD_SPACE_EXPORT 8192
ensure_env POST_CRAWL_AUTO_EXPORT true
ensure_env POST_CRAWL_REORGANIZE true
ensure_env POST_CRAWL_AUDIT true
ensure_env NOTIFY_PROGRESS_EVERY_PCT 50
ensure_env SMTP_ENABLED true
ensure_env SMTP_HOST smtp.hostinger.com
ensure_env SMTP_PORT 465
ensure_env SMTP_SECURE true

missing=()
for var in DOCK_USERNAME DOCK_PASSWORD SMTP_USER SMTP_PASS SMTP_TO; do
  val="$(grep -E "^${var}=" .env 2>/dev/null | cut -d= -f2- || true)"
  if [[ -z "${val// }" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo ""
  echo "Preencha no .env (chmod 600): ${missing[*]}"
  echo "  nano .env"
  echo ""
fi

# Fase 2 — build
echo "==> docker compose build"
docker compose build

# Fase 4 — login + test-email (só se credenciais presentes)
if [[ ${#missing[@]} -eq 0 ]]; then
  echo "==> docker compose run --rm login (ReadMe: Log in with Password + DOCK_* no .env)"
  docker compose run --rm login

  echo "==> test-email"
  docker compose run --rm test-email
else
  echo "==> Pulando login/test-email até .env estar completo"
fi

echo ""
echo "Próximos passos:"
echo "  ./scripts/healthcheck.sh"
echo "  # Se tiver storage/raw-html da WSL:"
echo "  docker compose run --rm rebuild"
echo "  docker compose run --rm audit"
echo "  # Crawl completo (SOMENTE com autorização):"
echo "  docker compose run --rm crawl"
