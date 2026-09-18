package com.portfolioai.auth.infrastructure.security

import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * OIDC counterpart of [CustomOAuth2UserService]. Spring Security uses a **distinct** user service
 * for OIDC flows (Google login requests the `openid` scope, which triggers
 * `OidcAuthorizationCodeAuthenticationProvider` → `OidcUserService`, not the plain
 * `OAuth2UserService`). Without registering this bean alongside the plain one, Spring falls back to
 * the default `OidcUserService` which returns a `DefaultOidcUser` — and our
 * `AuthService.getCurrentUser` would then crash on the unexpected principal type.
 *
 * Implementation delegates the userinfo HTTP fetch to the parent class (so we inherit the standard
 * OIDC claim validation, ID token parsing and refresh handling), then reuses
 * [CustomOAuth2UserService.findOrCreateUser] for the DB-side find-or-create. The returned principal
 * is an [AppOidcUser] which carries our `userId` UUID alongside the standard `DefaultOidcUser`
 * fields.
 */
@Service
class CustomOidcUserService(private val customOAuth2UserService: CustomOAuth2UserService) :
  OidcUserService() {

  @Transactional
  override fun loadUser(userRequest: OidcUserRequest): OidcUser {
    val oidcUser = super.loadUser(userRequest)
    val email =
      oidcUser.email
        ?: error("Google OIDC userinfo missing email — check requested scopes include 'email'")
    val sub =
      oidcUser.subject ?: error("Google OIDC userinfo missing sub — Google response shape changed")
    val name = oidcUser.fullName ?: oidcUser.givenName

    val user =
      customOAuth2UserService.findOrCreateUser(
        email = email,
        sub = sub,
        name = name,
        provider = userRequest.clientRegistration.registrationId,
      )

    return AppOidcUser(
      userId = user.id,
      authorities = listOf(SimpleGrantedAuthority("ROLE_${user.role.name}")),
      idToken = oidcUser.idToken,
      userInfo = oidcUser.userInfo,
    )
  }
}
