#!/usr/bin/env bash
# WSL2 only: polls the backend sources and triggers `backend-compile` when one of them moved.
#
# The repo sits on /mnt/c (9p), where inotify never sees a write made from the **Windows** side —
# an editor, an IDE or an agent running on Windows. Tilt's own file watch is built on inotify, so
# `backend-compile` would simply never fire for those writes and the running backend would keep
# serving stale code (lived it : a request answered against a DTO that no longer existed).
# Polling is the only thing that crosses the mount reliably, so on WSL this loop replaces the watch.
#
# macOS watches natively — the Tiltfile does not declare this resource there.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

WATCHED="projects/backend/src/main"
INTERVAL="${BACKEND_WATCH_INTERVAL:-2}"
stamp="$(mktemp)"
trap 'rm -f "$stamp"' EXIT

step "Watching $WATCHED every ${INTERVAL}s (WSL polling)"

while true; do
  sleep "$INTERVAL"
  # `-quit` stops at the first hit : we only need to know *that* something moved.
  changed="$(find "$WATCHED" -type f -newer "$stamp" -print -quit 2>/dev/null || true)"
  [ -n "$changed" ] || continue

  touch "$stamp"
  ok "changed: ${changed#"$WATCHED"/} — recompiling"
  # Ignore the failure when the resource is already updating : the next tick catches up.
  tilt trigger backend-compile >/dev/null 2>&1 || warn "could not trigger backend-compile"
done
