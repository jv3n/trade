#!/usr/bin/env bash
# Runs one of the checks CI also runs, from the Tilt UI.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

case "${1:?usage: run-check.sh <backend-test|frontend-test|e2e|lint|format>}" in
backend-test)
  step "Backend tests"
  (cd projects/backend && ./gradlew test)
  ;;
frontend-test)
  step "Frontend tests"
  (cd projects/frontend && npm run test)
  ;;
e2e)
  # Against the stack Tilt is serving : the backend runs the `e2e` profile the suite signs in with.
  step "End-to-end tests"
  # A no-op once Chromium is there ; the first run downloads it (~110 MB).
  (cd projects/frontend && npx playwright install chromium)
  (cd projects/frontend && E2E_BASE_URL="http://localhost:${FRONTEND_HOST_PORT:-4200}" npm run e2e)
  ;;
lint)
  step "Lint"
  (cd projects/backend && ./gradlew spotlessCheck detekt)
  (cd projects/frontend && npm run lint)
  ;;
format)
  step "Format"
  (cd projects/backend && ./gradlew spotlessApply)
  (cd projects/frontend && npm run format)
  ;;
*)
  ko "unknown check '$1'"
  exit 1
  ;;
esac

ok "done"
