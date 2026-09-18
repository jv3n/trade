package com.portfolioai.auth.infrastructure.security

import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * End-to-end test of the `local-no-auth` profile : boot the full Spring context with the bypass
 * active and check the chain works as a whole.
 *
 * The bypass has three moving parts that only make sense together :
 * 1. [LocalNoAuthUserInitializer] seeds a dev user (`dev@local.test`, role ADMIN) at boot.
 * 2. [LocalNoAuthSecurityConfig] wires a permitAll filter chain — replacing [SecurityConfig] via
 *    `@Profile` switching — and registers [LocalNoAuthFilter] before
 *    `AnonymousAuthenticationFilter`.
 * 3. [LocalNoAuthFilter] reads the seeded row and injects an [AppOAuth2User] principal into the
 *    security context on every request.
 *
 * If any one of these breaks, `GET /api/me` either 404s (controller didn't load), 401s (filter
 * didn't inject the principal), 200s with the wrong user (initializer ran against a stale DB), or
 * 500s (`AuthService.getCurrentUser` couldn't resolve the principal). We use a real MockMvc
 * round-trip rather than unit-testing the parts because the bug class we're guarding against is "I
 * changed one of these, the others still work in isolation, but the whole chain is broken".
 *
 * **Database dependency** : runs against the same Postgres as `tilt up` (the Gradle `test` task
 * injects `.env` so the port mapping matches). Tests that need a fresh schema would have to opt
 * into a separate database — that's not the case here, the initializer is idempotent and the dev
 * user persists harmlessly across runs.
 *
 * `application.yml` defines all secret placeholders with an empty default (`${ANTHROPIC_API_KEY:}`,
 * idem TwelveData / Finnhub), so the context boots without any `@TestPropertySource` override — the
 * LLM / market beans accept a blank key at wiring time and only surface a clear error at the first
 * call. This test never reaches that call (it only exercises `/api/me`), so no placeholder is
 * needed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local-no-auth")
class LocalNoAuthIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var userRepository: UserRepository

  @Test
  fun `dev user is seeded by the initializer and reachable via the repository`() {
    // First leg : `LocalNoAuthUserInitializer` ran during boot and the dev row exists. This
    // doubles as a regression on the idempotency contract — re-runs of the test against the
    // same DB don't duplicate it (UNIQUE on `email` would 500 the boot ; we'd see it here).
    val dev = userRepository.findByEmail(LocalNoAuthFilter.LOCAL_DEV_EMAIL)
    assertNotNull(dev) { "Dev user not found — LocalNoAuthUserInitializer didn't run" }
    assertEquals(Role.ADMIN, dev!!.role)
    assertEquals("local-dev", dev.provider)
  }

  @Test
  fun `GET api me returns the dev user without any authentication header`() {
    // Second leg : the filter injects the principal and the controller serializes it. No
    // `Authorization` header, no session cookie, no `.with(user(...))` — the dev profile is
    // explicitly permissive. This is the contract `tilt up` relies on every day.
    mvc
      .perform(get("/api/me"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.email").value(LocalNoAuthFilter.LOCAL_DEV_EMAIL))
      .andExpect(jsonPath("$.role").value("ADMIN"))
  }
}
