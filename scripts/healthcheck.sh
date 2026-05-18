#!/usr/bin/env bash
# Healthcheck: session, storage counts, SMTP config (no crawl)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ok=0
warn=0
fail=0

check_ok() { echo "  [OK]   $*"; ((ok++)) || true; }
check_warn() { echo "  [WARN] $*"; ((warn++)) || true; }
check_fail() { echo "  [FAIL] $*"; ((fail++)) || true; }

echo "==> api-crawler healthcheck"

if [[ -f .env ]]; then
  perms="$(stat -c '%a' .env 2>/dev/null || stat -f '%OLp' .env 2>/dev/null)"
  if [[ "$perms" == "600" ]]; then
    check_ok ".env exists (chmod 600)"
  else
    check_warn ".env permissions: $perms (expected 600)"
  fi
else
  check_fail ".env missing — run: cp .env.example .env && chmod 600 .env"
fi

if [[ -f storage/auth/session.json ]]; then
  check_ok "session.json present"
else
  check_warn "session.json missing — run: docker compose run --rm login"
fi

html_count="$(find storage/raw-html -name '*.html' 2>/dev/null | wc -l | tr -d ' ')"
json_count="$(find storage/json -name '*.json' ! -name index.json 2>/dev/null | wc -l | tr -d ' ')"
echo "  storage: ${html_count} HTML, ${json_count} JSON"

if [[ "$html_count" -gt 0 ]]; then
  check_ok "raw-html cache available for rebuild"
elif [[ "$json_count" -gt 0 ]]; then
  check_warn "JSON without raw-html — rebuild may not help"
else
  check_warn "empty storage — copy from WSL or run crawl (with authorization)"
fi

if command -v docker >/dev/null 2>&1; then
  check_ok "docker $(docker --version | head -1)"
else
  check_fail "docker not installed"
fi

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env 2>/dev/null || true
  set +a
  for var in SMTP_HOST SMTP_USER SMTP_TO; do
    if [[ -z "${!var:-}" ]]; then
      check_fail "SMTP: $var not set"
    fi
  done
  if [[ "${SMTP_ENABLED:-false}" == "true" ]]; then
    check_ok "SMTP enabled (${SMTP_HOST:-?})"
  else
    check_warn "SMTP_ENABLED is not true"
  fi
fi

echo ""
echo "Summary: $ok ok, $warn warnings, $fail failures"
[[ "$fail" -eq 0 ]] || exit 1
