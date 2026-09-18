package com.portfolioai.auth.domain

/**
 * Role attached to a [User]. Drives the `hasRole("ADMIN")` matchers in `SecurityConfig` and the
 * navbar/route guards on the frontend.
 *
 * Kept deliberately small in v1 — `ADMIN` for the operator (provider switches, prompt management,
 * narrative observability), `USER` for everyone else who can still consult their portfolio,
 * watchlist, ticker dossiers and run CSV imports. Adding finer-grained scopes (e.g. `VIEWER`
 * read-only on portfolio) would only be worth it once a real use case shows up.
 */
enum class Role {
  ADMIN,
  USER,
}
