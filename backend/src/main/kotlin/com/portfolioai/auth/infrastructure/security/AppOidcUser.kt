package com.portfolioai.auth.infrastructure.security

import java.util.UUID
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.OidcUserInfo
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser

/**
 * Custom OIDC principal returned by [CustomOidcUserService] (for the Google login path). Carries
 * the DB-side [userId] in addition to the standard `DefaultOidcUser` fields, so
 * `AuthService.getCurrentUser` can resolve the [com.portfolioai.auth.domain.User] row without
 * re-reading the email-keyed lookup on every request.
 *
 * Extends Spring's `DefaultOidcUser` instead of just implementing `OidcUser` because the standard
 * class handles the claim-extraction plumbing (`getEmail`, `getFullName`, `getPicture`…) and Spring
 * Security expects that shape internally for some downstream consumers (token relay, refresh token
 * rotation in future).
 *
 * The `nameAttributeKey` is fixed at `"sub"` to mirror Google's OIDC convention.
 */
class AppOidcUser(
  override val userId: UUID,
  authorities: Collection<GrantedAuthority>,
  idToken: OidcIdToken,
  userInfo: OidcUserInfo? = null,
) : DefaultOidcUser(authorities, idToken, userInfo, "sub"), AppUserPrincipal
