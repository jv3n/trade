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
 * **Cleanup strategy** — MDC is thread-local on Tomcat's pooled request-handler threads ; we wrap
 * the chain in `try { … } finally { MDC.remove(…) }` to prevent leak across reused threads. Sentry
 * uses `Sentry.withScope { … }` which pushes a temporary scope, runs the body, and **auto-restores
 * the parent scope** on return (or exception). Replaces the deprecated `Sentry.configureScope` +
 * manual `user = null` reset pattern (Sentry SDK v8 deprecation, removed in v9).
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
    if (userId == null) {
      // Unauthenticated request — no MDC tag, no Sentry user. Forward unchanged.
      filterChain.doFilter(request, response)
      return
    }

    MDC.put(USER_ID_KEY, userId)
    try {
      // `withScope` pushes a temporary scope cloned from the parent, runs the body, then pops the
      // scope and restores the parent on return / exception. Cleaner than the v7-style
      // `configureScope` + `finally { user = null }` pair (deprecated v8, removed v9).
      Sentry.withScope { scope ->
        scope.user = User().apply { id = userId }
        filterChain.doFilter(request, response)
      }
    } finally {
      MDC.remove(USER_ID_KEY)
    }
  }

  companion object {
    const val USER_ID_KEY = "userId"
  }
}
