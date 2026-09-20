#!/usr/bin/env bash
# Shared setup for the Tilt tool scripts: repo root as cwd, computed Tilt env, stack constants.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

# `.tilt.env` is written by the Tiltfile at load time (ports, resolved toolchain, relocated Gradle
# dirs). Read key by key rather than sourced — values are not guaranteed to be shell-safe.
tilt_env() {
  local line
  if [ -f .tilt.env ] && line=$(grep -m1 "^${1}=" .tilt.env); then
    printf '%s' "${line#*=}"
  else
    printf '%s' "${2:-}"
  fi
}

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PG_CONTAINER="portfolioai-postgres"
PG_USER="portfolioai"
PG_DB="portfolioai"

GRADLE_BUILD_DIR="$(tilt_env GRADLE_BUILD_DIR projects/backend/build)"
GRADLE_PROJECT_CACHE="$(tilt_env GRADLE_PROJECT_CACHE projects/backend/.gradle)"
JAVA_HOME="$(tilt_env JAVA_HOME "${JAVA_HOME:-}")"
export JAVA_HOME
# Only when it isn't already first in line: Tilt hands us a PATH that already starts with it, and
# prepending again would push a duplicate into every child process.
node_bin="$(tilt_env NODE_BIN "")"
if [ -n "$node_bin" ]; then
  case ":$PATH:" in
    *":$node_bin:"*) ;;
    *) PATH="$node_bin${PATH:+:$PATH}" ;;
  esac
fi
export PATH

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
ko() { printf '  \033[31m✗\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

require_postgres() {
  docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 ||
    { ko "postgres is not accepting connections — start the 'postgres' resource first"; exit 1; }
}

psql_exec() { docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 "$@"; }
