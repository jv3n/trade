#!/usr/bin/env bash
# Flips BACKEND_AUTH_MODE in `.env`. The Tiltfile reads that file, so Tilt reloads and restarts the
# backend with the matching Spring profiles on its own.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

mode="${1:?usage: auth-mode.sh <no-auth|oauth>}"
case "$mode" in
no-auth | oauth) ;;
*)
  ko "unknown mode '$mode' — expected no-auth or oauth"
  exit 1
  ;;
esac

touch .env
grep -v '^BACKEND_AUTH_MODE=' .env >.env.tmp || true
mv .env.tmp .env
echo "BACKEND_AUTH_MODE=$mode" >>.env

if [ "$mode" = "oauth" ]; then
  ok "switched to oauth — needs real Google client-id/secret and APP_ADMIN_EMAILS in .env"
else
  ok "switched to no-auth — fake ADMIN dev@local.test injected on every request"
fi
