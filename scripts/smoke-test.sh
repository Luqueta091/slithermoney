#!/usr/bin/env bash

set -euo pipefail

SMOKE_API_URL="${SMOKE_API_URL:-}"
SMOKE_GAME_URL="${SMOKE_GAME_URL:-}"
SMOKE_BACKOFFICE_URL="${SMOKE_BACKOFFICE_URL:-}"

if [[ -z "$SMOKE_API_URL" && -z "$SMOKE_GAME_URL" && -z "$SMOKE_BACKOFFICE_URL" ]]; then
  echo "No smoke test URLs provided. Skipping."
  exit 0
fi

failures=0

check_health() {
  local name="$1"
  local base_url="$2"

  if [[ -z "$base_url" ]]; then
    return 0
  fi

  local url="${base_url%/}/health"
  echo "Checking $name at $url"

  local response
  if ! response="$(curl -fsS --max-time 10 "$url")"; then
    echo "Health check failed for $name."
    failures=$((failures + 1))
    return 0
  fi

  if ! echo "$response" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    echo "Unexpected health response for $name: $response"
    failures=$((failures + 1))
  fi
}

check_health "api" "$SMOKE_API_URL"
check_health "game-server" "$SMOKE_GAME_URL"
check_health "backoffice" "$SMOKE_BACKOFFICE_URL"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi
