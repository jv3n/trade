package com.portfolioai.auth.infrastructure.security

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfFilter
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler

/**
 * Production-side filter chain — wired whenever the `local-no-auth` profile is NOT active. The
 * exact route matrix lives in `authorizeHttpRequests` below ; in short : health + OAuth callback
 * routes are permitAll, the three back-office areas (config, prompts, narrative observability)
 * require ROLE_ADMIN, everything else requires an authenticated session.
 *
 * Unauthenticated requests get a HTTP 401, not the default 302 to the Google authorization URL —
 * the SPA's HTTP interceptor needs a clean status code to decide whether to redirect to /login. A
 * silent 302 from an XHR call would be followed by the browser, ending in a CORS error or a fetched
 * Google login HTML body that confuses the caller.
 *
 * `oauth2Login()` is conditional on the [ClientRegistrationRepository] bean being present. That
 * bean only exists when at least one `spring.security.oauth2.client.registration.<provider>` is
 * configured. Without it, the context still loads cleanly (so the `BackendApplicationTests` smoke
 * test runs without any OAuth config and the API stays locked down) — login simply isn't available.
 * Provision the env vars `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (or fill
 * `application-local.yml`) to enable the actual flow.
 *
 * CSRF is **enabled** with the cookie-based SPA pattern : the server writes a non-HttpOnly
 * `XSRF-TOKEN` cookie (so Angular's `HttpClient` can read it), and expects mutating requests
 * (POST/PUT/PATCH/DELETE) to echo the value in the `X-XSRF-TOKEN` header. The plain
 * `CsrfTokenRequestAttributeHandler` (no XOR randomization) is used so the SPA can forward the raw
 * cookie value without transformation — the default `XorCsrfTokenRequestAttributeHandler` mangles
 * the token for BREACH-attack mitigation, which doesn't work with a SPA that just
 * reads-and-forwards. [CsrfTokenResponseFilter] is added after the standard `CsrfFilter` to eagerly
 * resolve the token attribute, forcing the cookie to be written on every response (Spring Security
 * 6 made resolution lazy by default).
 */
@Configuration
@Profile("!local-no-auth")
class SecurityConfig(
  /**
   * Cible du redirect après login OAuth réussi. En prod (SPA + backend derrière le même reverse
   * proxy), `/` suffit — Spring redirige vers `/` et le proxy sert la SPA. En dev où le SPA tourne
   * sur un port distinct du backend (Angular CLI 4200/4201 vs Spring Boot 8080/8081), on doit
   * pointer explicitement vers l'URL du SPA, sinon Spring redirige vers son propre `/` et
   * l'utilisateur atterrit sur le backend (Whitelabel 404). La session cookie est scopée sur
   * `localhost` (sans port) donc valide cross-port — il suffit de naviguer côté SPA pour que le
   * `/api/me` suivant remonte la session.
   */
  @Value("\${app.frontend-url:/}") private val frontendUrl: String
) {

  @Bean
  fun securityFilterChain(
    http: HttpSecurity,
    clientRegistrationRepository: ObjectProvider<ClientRegistrationRepository>,
    customOAuth2UserService: CustomOAuth2UserService,
    customOidcUserService: CustomOidcUserService,
  ): SecurityFilterChain {
    http
      .csrf { csrf ->
        csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
        csrf.csrfTokenRequestHandler(CsrfTokenRequestAttributeHandler())
      }
      .addFilterAfter(CsrfTokenResponseFilter(), CsrfFilter::class.java)
      .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED) }
      .authorizeHttpRequests {
        it.requestMatchers("/actuator/health", "/login/**", "/oauth2/**").permitAll()
        it.requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
        it
          .requestMatchers("/api/config/**", "/api/prompts/**", "/api/narrative/observability/**")
          .hasRole("ADMIN")
        // `/api/me` is **intentionally** not in `permitAll`. The SPA calls it at boot via
        // `AuthService.refresh()` precisely to discover whether a valid session exists : an
        // anonymous client gets a 401, which the frontend swallow and treats as "not logged
        // in → currentUser = null". A 200 with `null` payload would be more REST-ortho but
        // would force `AuthController.getCurrentUser` to handle the anonymous principal case
        // (today it assumes one is present). The 401-as-signal contract is the simpler
        // invariant — don't move `/api/me` into `permitAll` by reflex.
        it.requestMatchers("/api/**").authenticated()
        // Tout le reste = `permitAll`. Couvre (a) la SPA Angular embarquée dans le jar prod
        // (`src/main/resources/static/index.html` + bundles JS/CSS + `/assets/**` + `/i18n/**`)
        // que Spring sert automatiquement via son resource handler, et (b) les routes client-side
        // Angular (`/dashboard`, `/login`, `/error`, `/ticker/**`, `/settings/**`, etc.) qui se
        // résolvent via `SpaFallbackConfig` (forward vers `index.html`, Angular Router prend le
        // relais). Aucune surface API n'est exposée par cette ligne — toutes les routes data
        // commencent par `/api/**` (authenticated() ci-dessus) ou `/actuator/**` (auth Spring
        // Boot par défaut, seul `/actuator/health` est permitAll par notre matcher initial).
        it.anyRequest().permitAll()
      }
      .exceptionHandling {
        it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
      }
      .logout { it.logoutSuccessUrl("/").permitAll() }

    clientRegistrationRepository.ifAvailable?.let {
      http.oauth2Login { login ->
        login.userInfoEndpoint { ep ->
          // `userService` handles non-OIDC OAuth2 flows (hypothetical future GitHub OAuth2
          // without OIDC scope) ; `oidcUserService` handles OIDC flows (Google login with the
          // `openid` scope, which is our v1 production path). Without the latter, Spring would
          // fall back to its default `OidcUserService` returning a `DefaultOidcUser` principal —
          // and `AuthService.getCurrentUser` would crash on the unexpected type.
          ep.userService(customOAuth2UserService)
          ep.oidcUserService(customOidcUserService)
        }
        login.defaultSuccessUrl(frontendUrl, true)
        // Translate OAuth2 failures into a clean redirect with a query param the SPA reads to
        // render an inline message on `/login`. The `not_authorized` code is what
        // `CustomOAuth2UserService.assertAuthorized` throws when an inbound email isn't in the
        // effective whitelist — gives the user a clear "access denied" message instead of an
        // opaque 500 page. Any other OAuth2 failure (network, malformed token, Google misconfig)
        // falls through to `oauth_failed` — useful for operator debugging via the URL bar.
        login.failureHandler(oauth2FailureHandler())
      }
    }
    return http.build()
  }

  private fun oauth2FailureHandler(): AuthenticationFailureHandler =
    AuthenticationFailureHandler { _, response, exception ->
      val errorCode = (exception as? OAuth2AuthenticationException)?.error?.errorCode
      val target =
        when (errorCode) {
          "not_authorized" -> "/login?error=not_authorized"
          else -> "/login?error=oauth_failed"
        }
      // Defensive : if a filter further up the chain (e.g. CSRF on a malformed callback request)
      // already committed the response, `sendRedirect` would throw `IllegalStateException`
      // silently swallowed by the filter chain — leaving the user on a blank page. The current
      // OAuth2 filter topology never commits before us, so this guard is belt-and-suspenders, but
      // cheap insurance against a future filter order change.
      if (!response.isCommitted) response.sendRedirect(target)
    }
}
