package com.portfolioai.auth.infrastructure.security

import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfFilter
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler

/**
 * Dev-only filter chain — active under the `local-no-auth` profile.
 *
 * Permits every request and pre-populates the security context with a fake admin principal via
 * [LocalNoAuthFilter] so [com.portfolioai.auth.application.AuthService.getCurrentUser] keeps
 * working without an OAuth callback.
 *
 * **CSRF is enabled even in dev** with the same SPA cookie-based pattern as [SecurityConfig] (cf.
 * `application.yml` profile group `local: local-no-auth`). Disabling CSRF only in dev would mean
 * the SPA's POST/PUT/PATCH/DELETE paths behave differently from prod — a regression triggered by
 * missing `X-XSRF-TOKEN` headers would only surface when the dev flips to OAuth mode, and that's
 * exactly the kind of surprise we want to avoid. The dev cost is one extra cookie round-trip per
 * request, negligible.
 *
 * **To switch to the real Google OAuth flow against localhost**, set `BACKEND_AUTH_MODE=oauth` in
 * `.env` (or use the Tilt button) — this config drops out via the `@Profile` switch and
 * [SecurityConfig] takes over.
 */
@Configuration
@Profile("local-no-auth")
class LocalNoAuthSecurityConfig {

  @Bean
  fun securityFilterChain(
    http: HttpSecurity,
    localNoAuthFilter: LocalNoAuthFilter,
  ): SecurityFilterChain {
    http
      .csrf { csrf ->
        csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
        csrf.csrfTokenRequestHandler(CsrfTokenRequestAttributeHandler())
      }
      .addFilterAfter(CsrfTokenResponseFilter(), CsrfFilter::class.java)
      .authorizeHttpRequests { it.anyRequest().permitAll() }
      .addFilterBefore(localNoAuthFilter, AnonymousAuthenticationFilter::class.java)
    return http.build()
  }

  /**
   * Prevents Spring Boot from auto-registering [LocalNoAuthFilter] as a global servlet filter on
   * top of the manual `addFilterBefore` above. Without this, the filter would run twice per request
   * (once via the global chain, once inside the security chain) — [LocalNoAuthFilter] extends
   * `OncePerRequestFilter` so the second pass is a no-op, but the double-registration is misleading
   * in startup logs and adds an unnecessary check on each request.
   */
  @Bean
  fun localNoAuthFilterRegistration(
    filter: LocalNoAuthFilter
  ): FilterRegistrationBean<LocalNoAuthFilter> =
    FilterRegistrationBean(filter).also { it.isEnabled = false }
}
