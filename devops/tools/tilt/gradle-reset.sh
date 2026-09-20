#!/usr/bin/env bash
# Stops the Gradle daemons and wipes the build dir and Tilt's project cache. Clears stale compiled
# output, a stuck file-hash lock, and a configuration cache invalidated by a toolchain bump.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

step "Stopping Gradle daemons"
(cd projects/backend && ./gradlew --stop) || true

rm -rf "$GRADLE_BUILD_DIR" "$GRADLE_PROJECT_CACHE"
ok "build dir and project cache wiped — trigger the backend to recompile"
