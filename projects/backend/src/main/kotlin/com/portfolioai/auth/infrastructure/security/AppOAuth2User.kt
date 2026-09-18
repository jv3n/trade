package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.AppUserPrincipal
import java.util.UUID
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.oauth2.core.user.OAuth2User

/**
 * Custom [OAuth2User] returned by [CustomOAuth2UserService] (and by [LocalNoAuthFilter] under the
 * dev profile). Carries the DB-side [userId] so that
 * [com.portfolioai.auth.application.AuthService.getCurrentUser] resolves the
 * [com.portfolioai.auth.domain.User] row without re-reading the email-keyed lookup on every
 * request.
 *
 * Spring Security stores this object in the `SecurityContext` ; downstream beans cast
 * `authentication.principal` to this type. Don't make it a `data class` — `OAuth2User` carries
 * mutable attribute maps and Spring expects identity semantics, not value semantics.
 */
class AppOAuth2User(
  override val userId: UUID,
  val email: String,
  private val attributes: Map<String, Any>,
  private val authorities: Collection<GrantedAuthority>,
) : OAuth2User, AppUserPrincipal {

  override fun getName(): String = email

  override fun getAttributes(): Map<String, Any> = attributes

  override fun getAuthorities(): Collection<GrantedAuthority> = authorities
}
