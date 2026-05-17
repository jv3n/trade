package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.infrastructure.persistence.UserRepository
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Profile
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Injects a pre-authenticated [AppOAuth2User] principal on every request when the `local-no-auth`
 * profile is active. The principal references the dev user seeded by [LocalNoAuthUserInitializer]
 * (email [LOCAL_DEV_EMAIL], role ADMIN) — downstream services and controllers treat it like any
 * other authenticated session.
 *
 * Idempotent against re-entrance : skips work if the security context already carries an
 * authentication (e.g. a test set one up via `@WithMockUser`).
 */
@Component
@Profile("local-no-auth")
class LocalNoAuthFilter(private val userRepository: UserRepository) : OncePerRequestFilter() {

  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    filterChain: FilterChain,
  ) {
    if (SecurityContextHolder.getContext().authentication == null) {
      val devUser =
        userRepository.findByEmail(LOCAL_DEV_EMAIL)
          ?: error("Dev user not seeded — LocalNoAuthUserInitializer should have run on boot")
      val principal =
        AppOAuth2User(
          userId = devUser.id,
          email = devUser.email,
          attributes = mapOf("email" to devUser.email, "name" to (devUser.displayName ?: "Dev")),
          authorities = listOf(SimpleGrantedAuthority("ROLE_${devUser.role.name}")),
        )
      val auth = UsernamePasswordAuthenticationToken(principal, null, principal.authorities)
      SecurityContextHolder.getContext().authentication = auth
    }
    filterChain.doFilter(request, response)
  }

  companion object {
    const val LOCAL_DEV_EMAIL = "dev@local.test"
  }
}
