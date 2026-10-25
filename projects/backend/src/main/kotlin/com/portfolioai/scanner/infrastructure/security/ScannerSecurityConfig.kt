package com.portfolioai.scanner.infrastructure.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.security.MessageDigest
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher
import org.springframework.web.filter.OncePerRequestFilter

/**
 * ts-scanner's door (#763) : the `POST`s under `/api/scanner/` take its static bearer token
 * (`SCANNER_API_TOKEN`) and nothing else — no session, no CSRF. Ordered before the session chain of
 * `SecurityConfig`, which never reads the token : on any other path it is a 401. An empty token
 * keeps the door shut.
 */
@Configuration
class ScannerSecurityConfig(@Value("\${scanner.api-token:}") private val token: String) {

  @Bean
  @Order(1)
  fun scannerFilterChain(http: HttpSecurity): SecurityFilterChain {
    http
      .securityMatcher(PathPatternRequestMatcher.pathPattern(HttpMethod.POST, "/api/scanner/**"))
      .csrf { it.disable() }
      .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
      .addFilterBefore(ScannerTokenFilter(token), AnonymousAuthenticationFilter::class.java)
      .authorizeHttpRequests { it.anyRequest().hasRole(ROLE) }
      .exceptionHandling {
        it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
      }
    return http.build()
  }

  /** Not a bean : as one, Boot would also register it on every request of the servlet container. */
  private class ScannerTokenFilter(token: String) : OncePerRequestFilter() {
    private val expected = token.trim().toByteArray()

    override fun doFilterInternal(
      request: HttpServletRequest,
      response: HttpServletResponse,
      chain: FilterChain,
    ) {
      val sent =
        request
          .getHeader(HttpHeaders.AUTHORIZATION)
          ?.takeIf { it.startsWith(BEARER) }
          ?.drop(BEARER.length)
      // Constant-time, so the response time does not leak how much of the token was right.
      if (
        expected.isNotEmpty() && sent != null && MessageDigest.isEqual(sent.toByteArray(), expected)
      ) {
        SecurityContextHolder.getContext().authentication =
          UsernamePasswordAuthenticationToken.authenticated(
            "ts-scanner",
            null,
            listOf(SimpleGrantedAuthority("ROLE_$ROLE")),
          )
      }
      chain.doFilter(request, response)
    }
  }

  private companion object {
    const val ROLE = "SCANNER"
    const val BEARER = "Bearer "
  }
}
