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

# The binary the dev server actually runs, not the package directory around it : an install killed
# mid-`reify` leaves `@angular/cli/` in place with its bin link gone, and a directory test would
# call that tree healthy while `ng serve` dies on `ng: not found`.
deps_installed() { [ -x node_modules/.bin/ng ]; }

if deps_installed && [ "$have" = "$want" ]; then
  ok "dependencies up to date"
  exit 0
fi

# WSL2: `npm ci` **deletes** node_modules before reinstalling, and on /mnt/c (9p) that costs minutes
# — with the dev server running on those very files. An install that predates this stamp (first run
# after the stamp was introduced) is therefore adopted rather than redone; only a lockfile that
# actually moved pays the reinstall.
if [ "$is_wsl" = "1" ] && deps_installed && [ -z "$have" ]; then
  echo "$want" >"$stamp"
  warn "existing node_modules adopted without npm ci (WSL) — run it by hand if something looks off"
  exit 0
fi

# `resource_deps` only orders startup, so a lockfile change re-runs this while `ng serve` is still
# holding node_modules open. On 9p a rename over an open file fails with EACCES and npm dies
# half-way through, which is how a dependency bump used to leave the tree unusable. The dev server
# stands down for the install and comes back after — including when the install fails.
dev_server_stopped=0
restore_dev_server() {
  if [ "$dev_server_stopped" = "1" ]; then
    tilt enable frontend >/dev/null 2>&1 || warn "could not restart the frontend resource"
  fi
}
# Only when it is up : a resource the dev disabled by hand must stay that way.
frontend_state="$(tilt get uiresource frontend -o jsonpath='{.status.disableStatus.state}' 2>/dev/null || true)"
if [ "$is_wsl" = "1" ] && [ "$frontend_state" = "Enabled" ]; then
  if tilt disable frontend >/dev/null 2>&1; then
    dev_server_stopped=1
    trap restore_dev_server EXIT
    # Disabling returns before the command has let go of its file handles.
    sleep 3
  fi
fi

# `npm install` reconciles the tree against the lockfile in place ; `npm ci` wipes node_modules
# first, which is minutes of 9p churn. Reach for the big hammer only when the surgical one fails —
# typically on a tree a previous run left half-written.
step "npm install"
if ! npm install; then
  warn "npm install failed — falling back to npm ci"
  step "npm ci"
  npm ci
fi
echo "$want" >"$stamp"
ok "dependencies installed"
