#!/usr/bin/env bash
# Drops the schema and restarts the backend, which replays Flyway from scratch.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_postgres

step "Dropping schema public"
psql_exec -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;
              GRANT ALL ON SCHEMA public TO '"$PG_USER"'; GRANT ALL ON SCHEMA public TO public;'
ok "schema recreated empty"

# `processResources` is a Copy task: it never deletes an output whose source is gone, so a migration
# deleted or renamed in `src` lingers in the build dir and Flyway replays it from the classpath.
rm -rf "$GRADLE_BUILD_DIR/resources/main/db/migration"
ok "compiled migrations wiped"

# `tilt trigger` rather than touching a watched file: it forces the update whatever the state of the
# file watch, which is the difference between a backend that reconnects to an empty schema and one
# that keeps serving on stale connections.
tilt trigger backend
ok "backend restarting — Flyway will replay every migration"
