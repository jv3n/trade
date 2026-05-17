package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import java.time.Instant
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Bridges Google's OAuth2 user-info response to our [User] DB row.
 *
 * Flow : Spring Security finishes the OAuth redirect dance → calls this service with the userInfo
 * returned by Google. We look up (or create) the matching [User] row, refresh [User.lastLoginAt],
 * assign the role from the `app.admin.emails` whitelist on first creation, and return an
 * [AppOAuth2User] carrying the DB id so [com.portfolioai.auth.application.AuthService] can resolve
 * it on later requests without a second DB lookup on the principal.
 *
 * **Role assignment is one-shot** — at user creation only. Re-applying the whitelist on every login
 * would erase a manual rétrogradation (`UPDATE app_user SET role='USER'`) and would only apply
 * promotions on the *next* login of someone newly added to the whitelist, which is surprising. The
 * DB is the source of truth post-creation ; the whitelist only seeds.
 *
 * The class extends Spring's [DefaultOAuth2UserService] rather than implementing the interface
 * because we still want the standard userinfo HTTP fetch — only the post-fetch handling differs.
 */
@Service
class CustomOAuth2UserService(
  private val userRepository: UserRepository,
  @Value("\${app.admin.emails:}") private val adminEmailsRaw: String,
) : DefaultOAuth2UserService() {

  private val adminEmails: Set<String> by lazy {
    adminEmailsRaw.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
  }

  @Transactional
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

    val user = findOrCreateUser(email = email, sub = sub, name = name, provider = provider)

    return AppOAuth2User(
      userId = user.id,
      email = user.email,
      attributes = googleUser.attributes,
      authorities = listOf(SimpleGrantedAuthority("ROLE_${user.role.name}")),
    )
  }

  /**
   * Shared find-or-create logic — extracted so [CustomOidcUserService] can reuse it for the Google
   * OIDC path (which uses `OidcUserService`, not `OAuth2UserService`, and produces a different
   * principal type). Mutates the row in place when found ; saves a fresh row when not, applying the
   * admin-email whitelist at creation only.
   */
  internal fun findOrCreateUser(email: String, sub: String, name: String?, provider: String): User =
    userRepository.findByEmail(email)?.also {
      if (!name.isNullOrBlank()) it.displayName = name
      it.providerId = sub
      it.lastLoginAt = Instant.now()
    }
      ?: userRepository.save(
        User(
          email = email,
          displayName = name,
          provider = provider,
          providerId = sub,
          role = if (email.lowercase() in adminEmails) Role.ADMIN else Role.USER,
          lastLoginAt = Instant.now(),
        )
      )
}
