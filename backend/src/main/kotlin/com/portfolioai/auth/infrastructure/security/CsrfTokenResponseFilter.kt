package com.portfolioai.auth.infrastructure.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.filter.OncePerRequestFilter

/**
 * Forces eager resolution of the CSRF token on every request so the cookie-backed token repository
 * (`CookieCsrfTokenRepository.withHttpOnlyFalse()`) writes `Set-Cookie: XSRF-TOKEN=...` on the
 * response.
 *
 * Spring Security 6 changed the CSRF token plumbing to a **lazy** model — the token is only
 * resolved (and the cookie written) when something on the chain actually reads it, typically a
 * template tag or a form helper. A SPA flow doesn't read the token server-side ; it reads the
 * cookie client-side and forwards it in `X-XSRF-TOKEN`. Without this filter, the cookie would never
 * be set, the SPA would have no token to forward, and the first mutating request (POST, PUT, PATCH,
 * DELETE) would fail CSRF validation.
 *
 * Inserted after Spring's `CsrfFilter` in the chain so the token is already attached to the request
 * as an attribute by the time this filter runs ; the `csrfToken?.token` access is the trick that
 * triggers the underlying repository to write the cookie. The filter does no validation of its own
 * — Spring's `CsrfFilter` upstream already handled that.
 */
class CsrfTokenResponseFilter : OncePerRequestFilter() {

  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    filterChain: FilterChain,
  ) {
    val csrfToken = request.getAttribute(CsrfToken::class.java.name) as? CsrfToken
    // Touching the token value triggers the cookie write via the repository's
    // `saveToken` callback. The result is intentionally discarded.
    csrfToken?.token
    filterChain.doFilter(request, response)
  }
}
