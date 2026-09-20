#!/usr/bin/env bash
# Runs one of the checks CI also runs, from the Tilt UI.
# shellcheck source=_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

case "${1:?usage: run-check.sh <backend-test|frontend-test|lint|format>}" in
backend-test)
  step "Backend tests"
  (cd projects/backend && ./gradlew test)
  ;;
frontend-test)
  step "Frontend tests"
  (cd projects/frontend && npm run test)
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
