#!/usr/bin/env bash
# Loads the demo data mirroring the mockups, for the first user. The script refuses to run when the
# user already has data, so a stray click never overwrites anything.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

require_postgres

step "Seeding demo data"
psql_exec <devops/local/seed-demo.sql
ok "demo data loaded"
