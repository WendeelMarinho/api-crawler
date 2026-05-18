#!/usr/bin/env bash
# Uso: ./scripts/run-with-memory.sh crawl|rebuild|export|default -- [args para tsx]
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${1:-default}"
shift || true

case "$PROFILE" in
  crawl)   MB="${NODE_MAX_OLD_SPACE_CRAWL:-16384}" ;;
  rebuild) MB="${NODE_MAX_OLD_SPACE_REBUILD:-8192}" ;;
  export)  MB="${NODE_MAX_OLD_SPACE_EXPORT:-8192}" ;;
  *)       MB="${NODE_MAX_OLD_SPACE_MB:-4096}" ;;
esac

export NODE_OPTIONS="--max-old-space-size=${MB} ${NODE_OPTIONS:-}"
exec npx tsx src/index.ts "$@"
