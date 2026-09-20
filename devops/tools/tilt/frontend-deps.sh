#!/usr/bin/env bash
# Installs the frontend dependencies when they are missing or stale. Tilt re-runs the resource on
# every `tilt up`, so the lockfile hash is stamped into node_modules to keep that a no-op.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

is_wsl="$(tilt_env IS_WSL 0)"

cd projects/frontend

stamp="node_modules/.tilt-lock-hash"
want="$(sha1sum package-lock.json | cut -d' ' -f1)"
have="$(cat "$stamp" 2>/dev/null || true)"

if [ -d node_modules/@angular/cli ] && [ "$have" = "$want" ]; then
  ok "dependencies up to date"
  exit 0
fi

# WSL2: `npm ci` **deletes** node_modules before reinstalling, and on /mnt/c (9p) that costs minutes
# — with the dev server running on those very files. An install that predates this stamp (first run
# after the stamp was introduced) is therefore adopted rather than redone; only a lockfile that
# actually moved pays the reinstall.
if [ "$is_wsl" = "1" ] && [ -d node_modules/@angular/cli ] && [ -z "$have" ]; then
  echo "$want" >"$stamp"
  warn "existing node_modules adopted without npm ci (WSL) — run it by hand if something looks off"
  exit 0
fi

step "npm ci"
npm ci
echo "$want" >"$stamp"
ok "dependencies installed"
