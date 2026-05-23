package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.AppUserPrincipal
import io.sentry.Sentry
import io.sentry.protocol.User
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Per-request bridge that copies the authenticated principal's `userId` UUID into (a) Logback MDC
 * so the value appears in every log line emitted during the request, and (b) the current Sentry
 * scope so captured events are attributed to the right user in the dashboard ("users affected"
 * metric + filter-by-user).
 *
 * **Why a separate filter rather than wiring inside `CustomOAuth2UserService`** —
 * `findOrCreateUser` runs only at *login*, but we want the MDC tag on every authenticated request,
 * not just the OAuth callback. A `OncePerRequestFilter` registered downstream of Spring Security's
 * auth filters sees `SecurityContextHolder` already populated and applies on every request.
 *
 * **Never logs the email**. Same convention as `CustomOAuth2UserService.findOrCreateUser` — the
 * UUID is the join key for prod audit, the email is PII and stays out of logs and Sentry
 * breadcrumbs.
 *
 * **Cleanup in `finally`** — MDC and Sentry scope are thread-local; without explicit reset they'd
 * leak across pooled threads (Spring Web's Tomcat reuses request-handler threads).
 */
@Component
class SentryUserContextFilter : OncePerRequestFilter() {
  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    filterChain: FilterChain,
  ) {
    val principal = SecurityContextHolder.getContext().authentication?.principal
    val userId = (principal as? AppUserPrincipal)?.userId?.toString()
    if (userId != null) {
      MDC.put(USER_ID_KEY, userId)
      Sentry.configureScope { scope -> scope.user = User().apply { id = userId } }
    }
    try {
      filterChain.doFilter(request, response)
    } finally {
      if (userId != null) {
        MDC.remove(USER_ID_KEY)
        Sentry.configureScope { it.user = null }
      }
    }
  }

  companion object {
    const val USER_ID_KEY = "userId"
  }
}
