#!/usr/bin/env bash
# Restores the most recent dump from devops/local/dumps/, or the one passed as $1.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_postgres

source_dump="${1:-}"
if [ -z "$source_dump" ]; then
  source_dump="$(ls -t "$DUMP_DIR"/*.sql 2>/dev/null | head -1 || true)"
fi
[ -n "$source_dump" ] && [ -f "$source_dump" ] || { ko "no dump found in $DUMP_DIR — run the Dump button first"; exit 1; }

step "Restoring $source_dump"
psql_exec <"$source_dump" >/dev/null
ok "restored — restart the backend if the schema version moved"
