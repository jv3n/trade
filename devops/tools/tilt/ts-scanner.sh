#!/usr/bin/env bash
# Runs ts-scanner (#766) from its sibling checkout : it scans the previous trading day — or every
# trading day since a date, the one-month backfill — pushes what it found to trade's scanner
# endpoints, and exits. Against the local backend, or staging / production when asked.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

target="${1:?usage: ts-scanner.sh <local|staging|prod> [YYYY-MM-DD]}"
from="${2:-}"
checkout="${SCANNER_CHECKOUT:-$(dirname "$REPO_ROOT")/ts-scanner}"

[ -x "$checkout/gradlew" ] ||
  { ko "no ts-scanner checkout at $checkout — clone jv3n/ts-scanner next to trade, or set SCANNER_CHECKOUT in .env"; exit 1; }
# Its market-data key lives in its own `.env`, never in trade's.
{ [ -f "$checkout/.env" ] || [ -n "${MASSIVE_API_KEY:-}" ]; } ||
  { ko "no .env in $checkout — cp .env.example .env there, and fill MASSIVE_API_KEY"; exit 1; }

# A deployed trade : its URL from `.env`, checked before a scan that spends market-data calls ; its
# token read from Secret Manager at the moment of the run, never kept on the machine — `.env` is
# exported to every Tilt tool. gcloud's own stderr goes through : NOT_FOUND (not created yet) and an
# expired login would read alike otherwise.
remote() {
  local url_var="$1" secret="$2"
  url="${!url_var:-}"
  [ -n "$url" ] || { ko "set $url_var in .env — the API's base URL"; exit 1; }
  curl -fsS "$url/actuator/health" >/dev/null ||
    { ko "nothing answers on $url/actuator/health — check $url_var"; exit 1; }
  command -v gcloud >/dev/null || { ko "gcloud is needed : the token is read from Secret Manager"; exit 1; }
  token="$(gcloud secrets versions access latest --secret="$secret" \
    --project="${SCANNER_GCP_PROJECT:-trade-496613}")" ||
    { ko "could not read the $secret secret — see gcloud's reason above, and devops/docs/secrets.md"; exit 1; }
  [ -n "$token" ] || { ko "the $secret secret reads back empty — the push would get a 401"; exit 1; }
}

case "$target" in
local)
  url="http://localhost:${BACKEND_HOST_PORT:-8080}"
  token="${SCANNER_API_TOKEN:-}"
  [ -n "$token" ] ||
    { ko "SCANNER_API_TOKEN is empty in .env — the backend keeps the scanner's door shut without it"; exit 1; }
  [ -n "${SCANNER_OWNER_USER_ID:-}" ] ||
    { ko "SCANNER_OWNER_USER_ID is empty in .env — your app_user.id (SELECT id FROM app_user)"; exit 1; }
  curl -fsS "$url/actuator/health" >/dev/null ||
    { ko "the backend does not answer on $url — start the 'backend' resource first"; exit 1; }
  ;;
staging) remote SCANNER_STAGING_URL scanner-api-token-staging ;;
prod) remote SCANNER_PROD_URL scanner-api-token ;;
*)
  ko "unknown target '$target' — local, staging or prod"
  exit 1
  ;;
esac

args=()
if [ -n "$from" ]; then
  [[ "$from" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { ko "the first day reads YYYY-MM-DD, not '$from'"; exit 1; }
  args=(--args="--from $from")
  step "ts-scanner → $target ($url), every trading day since $from"
else
  step "ts-scanner → $target ($url), the previous trading day"
fi

# The token goes through the environment, never the command line : Tilt logs the command.
(cd "$checkout" && TRADE_URL="$url" TRADE_API_TOKEN="$token" ./gradlew --no-daemon --quiet run "${args[@]}")
ok "ts-scanner done ($target) — what it pushed shows under « À relire »"
