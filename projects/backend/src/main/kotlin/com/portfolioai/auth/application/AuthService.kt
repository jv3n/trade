package com.portfolioai.auth.application

import com.portfolioai.auth.domain.AppUserPrincipal
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

/**
 * Read-side access to the currently authenticated user.
 *
 * Resolves the principal sitting in the security context (set either by Spring Security's OAuth
 * machinery after a successful Google login, or by `LocalNoAuthFilter` under the dev profile) and
 * reloads the matching [User] row from the database — so callers always get fresh fields (e.g. an
 * updated [User.role] applied via SQL).
 *
 * Throws [IllegalStateException] when no authentication is set or the principal isn't an
 * [AppOAuth2User] — both indicate a wiring bug, not a user-facing error. Unauthenticated requests
 * are stopped earlier by Spring Security with HTTP 401 (cf. `SecurityConfig`).
 */
@Service
class AuthService(private val userRepository: UserRepository) {

  fun getCurrentUser(): User {
    val authentication =
      SecurityContextHolder.getContext().authentication
        ?: error("No authentication in security context — caller hit an authenticated endpoint")
    val principal =
      authentication.principal as? AppUserPrincipal
        ?: error(
          "Unexpected principal type ${authentication.principal::class.java.name} — expected AppUserPrincipal (AppOAuth2User or AppOidcUser)"
        )
    return userRepository.findById(principal.userId).orElseThrow {
      IllegalStateException("Authenticated user ${principal.userId} no longer exists in DB")
    }
  }

  fun isAdmin(): Boolean = getCurrentUser().role == Role.ADMIN

  /**
   * Updates the current user's UI preferences. Partial : a `null` field is left untouched (the SPA
   * sends only the knob that changed). Unknown values are rejected with HTTP 400 before the write —
   * the DB CHECK constraints are the hard backstop, this gives a clean error instead of a 500.
   */
  @Transactional
  fun updatePreferences(theme: String?, language: String?): User {
    val user = getCurrentUser()
    theme?.let {
      if (it !in ALLOWED_THEMES) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown theme '$it'")
      }
      user.theme = it
    }
    language?.let {
      if (it !in ALLOWED_LANGUAGES) {
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown language '$it'")
      }
      user.language = it
    }
    return userRepository.save(user)
  }

  companion object {
    private val ALLOWED_THEMES = setOf("dark", "light")
    private val ALLOWED_LANGUAGES = setOf("fr", "en")
  }
}
