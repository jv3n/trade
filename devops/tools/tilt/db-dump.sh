#!/usr/bin/env bash
# Snapshots the local database into devops/local/dumps/ (gitignored). Meant for the "let me try
# something destructive" moment, not for backups.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_postgres

mkdir -p "$DUMP_DIR"
target="$DUMP_DIR/$(date +%Y%m%d-%H%M%S).sql"

step "Dumping $PG_DB"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists >"$target"
ok "$target ($(du -h "$target" | cut -f1))"
