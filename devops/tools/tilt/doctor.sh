#!/usr/bin/env bash
# Diagnoses the local prerequisites of the Tilt stack. Every failure names the command that fixes
# it. Runs standalone (`./devops/tools/tilt/doctor.sh`), which is what to do when Tilt itself
# refuses to load.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

failures=0
fail() { ko "$1"; printf '     → %s\n' "$2"; failures=$((failures + 1)); }

# The `\r` strip matters : a Windows checkout hands us CRLF here, and a trailing carriage return
# makes every version comparison below fail with two identical-looking strings.
read_tool_version() { awk -v tool="$1" '$1 == tool { print $2 }' .tool-versions | tr -d '\r'; }

# `lsof` is absent from most WSL images ; `ss` ships with iproute2 there. Exit 2 when neither is
# around, so the caller says "cannot tell" rather than reporting every port free.
port_in_use() {
  if command -v lsof >/dev/null; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null; then
    ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
  else
    return 2
  fi
}

step "Toolchain"
node_want="$(read_tool_version nodejs)"
java_want="$(read_tool_version java | sed 's/^[a-z]*-//')"

if command -v node >/dev/null; then
  node_have="$(node --version | tr -d v)"
  if [ "$node_have" = "$node_want" ]; then
    ok "node $node_have"
  else
    warn "node $node_have on PATH, .tool-versions wants $node_want (Tilt pins it per-command, harmless)"
  fi
else
  fail "node is not installed" "nvm install $node_want"
fi

java_bin="${JAVA_HOME:+$JAVA_HOME/bin/java}"
[ -x "$java_bin" ] || java_bin="$(command -v java || true)"
if [ -n "$java_bin" ]; then
  java_have="$("$java_bin" -version 2>&1 | head -1 | sed -E 's/.*"([0-9.]+)".*/\1/')"
  if [ "${java_have%%.*}" = "${java_want%%.*}" ]; then
    ok "java $java_have (major ${java_want%%.*} required)"
  else
    fail "java $java_have on PATH, major ${java_want%%.*} required" "install a JDK ${java_want%%.*} and re-run"
  fi
else
  fail "java is not installed" "install a JDK ${java_want%%.*}"
fi

step "Docker"
if docker info >/dev/null 2>&1; then
  ok "docker daemon reachable"
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    ok "postgres accepting connections on ${POSTGRES_HOST_PORT:-5432}"
  else
    warn "postgres container down (normal before 'tilt up')"
  fi
else
  fail "docker daemon unreachable" "start Docker Desktop"
fi

step "Workspace"
if [ -d projects/frontend/node_modules/@angular/cli ]; then
  ok "frontend dependencies installed"
else
  fail "projects/frontend/node_modules missing — 'ng: command not found' at startup" \
    "trigger the 'frontend-deps' resource in Tilt, or run npm ci from projects/frontend"
fi

if [ -f .env ]; then
  ok ".env present (auth mode: ${BACKEND_AUTH_MODE:-no-auth})"
else
  warn ".env absent — defaults from .env.example apply"
fi

for port_var in POSTGRES_HOST_PORT:5432 BACKEND_HOST_PORT:8080 FRONTEND_HOST_PORT:4200; do
  name="${port_var%%:*}"
  port="${!name:-${port_var##*:}}"
  # `set -e` would abort the whole script on the non-zero exits this function uses as answers.
  state=0
  port_in_use "$port" || state=$?
  case $state in
  0) ok "$name=$port in use (expected once the stack is up)" ;;
  2) warn "$name=$port — no lsof or ss to check with (apt install iproute2)" ;;
  *) ok "$name=$port free" ;;
  esac
done

step "Result"
if [ "$failures" -eq 0 ]; then
  ok "no blocking issue"
else
  ko "$failures blocking issue(s) above"
  exit 1
fi
