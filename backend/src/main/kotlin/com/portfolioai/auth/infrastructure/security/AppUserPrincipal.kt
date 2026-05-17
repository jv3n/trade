package com.portfolioai.auth.infrastructure.security

import java.util.UUID

/**
 * Marker interface implemented by every principal type our security chain produces — currently
 * [AppOAuth2User] (used under `local-no-auth` profile and for hypothetical non-OIDC OAuth2
 * providers) and [AppOidcUser] (used for Google OIDC, the production path).
 *
 * `AuthService.getCurrentUser` casts the principal to this interface so it doesn't have to
 * differentiate between the two — it only needs the DB id ([userId]) to look up the full
 * [com.portfolioai.auth.domain.User] row. Without this, the AuthService would have to either branch
 * on the runtime type (fragile, easy to regress on a future principal type addition) or read
 * attributes by key (slower, requires the calling code to know whether the principal is OIDC or
 * not).
 *
 * Only [userId] is on this interface — email is intentionally **not** here because [AppOidcUser]
 * inherits a `getEmail()` method from `DefaultOidcUser` and exposing a Kotlin `val email: String`
 * on the interface would collide with that JVM signature. Email is read from the loaded `User`
 * entity, not from the principal directly.
 */
interface AppUserPrincipal {
  val userId: UUID
}
