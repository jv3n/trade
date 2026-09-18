package com.portfolioai.auth.domain

import java.util.UUID

/**
 * Marker interface implemented by every principal type our security chain produces — currently
 * `AppOAuth2User` (used under `local-no-auth` profile and for hypothetical non-OIDC OAuth2
 * providers) and `AppOidcUser` (used for Google OIDC, the production path). Both live in
 * `auth/infrastructure/security/` because their parent classes (`OAuth2User`, `DefaultOidcUser`)
 * are Spring Security types — this interface lives here in `domain/` because it carries no
 * framework dependency, only a domain concept (the DB id of the authenticated principal).
 *
 * `AuthService.getCurrentUser` casts the principal to this interface so it doesn't have to
 * differentiate between the two — it only needs the DB id ([userId]) to look up the full [User]
 * row. Without this, the AuthService would have to either branch on the runtime type (fragile, easy
 * to regress on a future principal type addition) or read attributes by key (slower, requires the
 * calling code to know whether the principal is OIDC or not).
 *
 * Only [userId] is on this interface — email is intentionally **not** here because `AppOidcUser`
 * inherits a `getEmail()` method from `DefaultOidcUser` and exposing a Kotlin `val email: String`
 * on the interface would collide with that JVM signature. Email is read from the loaded [User]
 * entity, not from the principal directly.
 */
interface AppUserPrincipal {
  val userId: UUID
}
