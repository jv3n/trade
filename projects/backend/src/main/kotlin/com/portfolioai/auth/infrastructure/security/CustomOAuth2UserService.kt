package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.application.UserProvisioningService
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service

/**
 * Bridges Google's OAuth2 user-info response to our `User` DB row.
 *
 * Flow : Spring Security finishes the OAuth redirect dance → calls this service with the userInfo
 * returned by Google. [UserProvisioningService] gates the email, finds or creates the row, and we
 * return an [AppOAuth2User] carrying the DB id so [com.portfolioai.auth.application.AuthService]
 * can resolve it on later requests without a second DB lookup on the principal.
 *
 * The class extends Spring's [DefaultOAuth2UserService] rather than implementing the interface
 * because we still want the standard userinfo HTTP fetch — only the post-fetch handling differs. So
 * it carries no `@Transactional` : the parent's `final` setters cannot be proxied (#590).
 */
@Service
class CustomOAuth2UserService(private val userProvisioning: UserProvisioningService) :
  DefaultOAuth2UserService() {

  override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User =
    processOAuth2User(super.loadUser(userRequest), userRequest.clientRegistration.registrationId)

  /**
   * Post-fetch handling — split out from [loadUser] so it can be unit-tested without hitting
   * Google's HTTP userinfo endpoint. Production callers go through [loadUser] ; tests construct a
   * fake [OAuth2User] (typically a `DefaultOAuth2User`) and call this directly.
   *
   * Marked `internal` so test classes in the same module reach it without widening the surface
   * publicly. Not `private` because of that test requirement.
   */
  internal fun processOAuth2User(googleUser: OAuth2User, provider: String): AppOAuth2User {
    val email =
      googleUser.getAttribute<String>("email")
        ?: error("Google userinfo missing email claim — check requested scopes include 'email'")
    val sub =
      googleUser.getAttribute<String>("sub")
        ?: error("Google userinfo missing sub claim — Google response shape changed")
    val name = googleUser.getAttribute<String>("name")

    val user =
      userProvisioning.findOrCreateUser(email = email, sub = sub, name = name, provider = provider)

    return AppOAuth2User(
      userId = user.id,
      email = user.email,
      attributes = googleUser.attributes,
      authorities = listOf(SimpleGrantedAuthority("ROLE_${user.role.name}")),
    )
  }
}
