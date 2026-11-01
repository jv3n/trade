package com.portfolioai.auth.domain

/**
 * Role attached to a [User]. Drives the `hasRole("ADMIN")` matchers in `SecurityConfig` and the
 * navbar/route guards on the frontend.
 *
 * Kept deliberately small in v1 — `ADMIN` for the operator (runtime settings, the lexicon), `USER`
 * for everyone else. Adding finer-grained scopes would only be worth it once a real use case shows
 * up.
 */
enum class Role {
  ADMIN,
  USER,
}
