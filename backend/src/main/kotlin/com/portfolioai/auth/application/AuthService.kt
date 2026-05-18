package com.portfolioai.auth.application

import com.portfolioai.auth.domain.AppUserPrincipal
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Service

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
}
