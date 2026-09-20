#!/usr/bin/env bash
# Reclaims every unused Docker resource. `--volumes` only drops volumes referenced by no container,
# so the local Postgres data survives as long as its container exists.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

step "Pruning"
docker system prune -af --volumes

step "Disk usage after"
docker system df
