package com.portfolioai.auth.infrastructure.security

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.csrf.CookieCsrfTokenRepository
import org.springframework.security.web.csrf.CsrfFilter
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler

/**
 * The application's only filter chain. The exact route matrix lives in `authorizeHttpRequests`
 * below ; in short : health + OAuth callback routes are permitAll, the three back-office areas
 * (config, prompts, narrative observability) require ROLE_ADMIN, the rest of the API and of the
 * actuator require an authenticated session, and the SPA itself is public.
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
class SecurityConfig(
  /**
   * Where a successful OAuth login lands. `/` is enough in prod, where the SPA and the backend
   * share an origin ; in dev the SPA has its own port and this must point at it explicitly, or the
   * user ends up on the backend's Whitelabel 404.
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
        // `/health/**` too : the Cloud Run probes hit `/actuator/health/liveness` and `/readiness`,
        // which the bare path doesn't match — a 401 there restarts the container.
        it
          .requestMatchers("/actuator/health", "/actuator/health/**", "/login/**", "/oauth2/**")
          .permitAll()
        it.requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
        it
          .requestMatchers("/api/config/**", "/api/prompts/**", "/api/narrative/observability/**")
          .hasRole("ADMIN")
        // Stats need no rule of their own : every endpoint (listing, KPIs, completion, delete, CSV
        // export) is user-scoped in the service, so they fall through to the `/api/**` rule below.
        // The lexicon is likewise a global, shared dataset : the `GET` listing is readable by every
        // authenticated user (it falls through to `/api/**` below), but create / update / delete
        // are
        // ADMIN-only (managed from the `/settings/lexicon` page). Gated per HTTP method so the read
        // path stays open ; POST hits the collection root, PUT / DELETE the `/{id}` sub-paths.
        it.requestMatchers(HttpMethod.POST, "/api/lexicon").hasRole("ADMIN")
        it.requestMatchers(HttpMethod.PUT, "/api/lexicon/**").hasRole("ADMIN")
        it.requestMatchers(HttpMethod.DELETE, "/api/lexicon/**").hasRole("ADMIN")
        // `/api/me` is **intentionally** not in `permitAll`. The SPA calls it at boot via
        // `AuthService.refresh()` precisely to discover whether a valid session exists : an
        // anonymous client gets a 401, which the frontend swallow and treats as "not logged
        // in → currentUser = null". A 200 with `null` payload would be more REST-ortho but
        // would force `AuthController.getCurrentUser` to handle the anonymous principal case
        // (today it assumes one is present). The 401-as-signal contract is the simpler
        // invariant — don't move `/api/me` into `permitAll` by reflex.
        it.requestMatchers("/api/**").authenticated()
        // `info` serves the release, the commit and the `info.*` properties : only the settings
        // page reads it, behind a session.
        it.requestMatchers("/actuator/**").authenticated()
        // Everything else is public : the embedded SPA and its client-side routes.
        it.anyRequest().permitAll()
      }
      .exceptionHandling {
        it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
      }
      .logout { it.logoutSuccessUrl("/").permitAll() }

    clientRegistrationRepository.ifAvailable?.let { repo ->
      http.oauth2Login { login ->
        // Force Google's account chooser on every login. Without `prompt=select_account`, an active
        // Google session + a prior consent makes Google silently re-pick the last account — no way
        // to switch identity (e.g. to exercise the not-authorized path with a non-whitelisted
        // email) short of an incognito window.
        login.authorizationEndpoint { endpoint ->
          val resolver = DefaultOAuth2AuthorizationRequestResolver(repo, "/oauth2/authorization")
          resolver.setAuthorizationRequestCustomizer { builder ->
            builder.additionalParameters { params -> params["prompt"] = "select_account" }
          }
          endpoint.authorizationRequestResolver(resolver)
        }
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
