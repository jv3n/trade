package com.portfolioai.auth.infrastructure.http

import com.portfolioai.auth.application.AuthService
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import java.time.Instant
import java.util.UUID
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice on [AuthController].
 *
 * The slice excludes filters via `@AutoConfigureMockMvc(addFilters = false)` so we exercise the
 * controller's mapping + JSON shape in isolation — the authenticated-vs-401 routing is Spring
 * Security wiring, covered by the integration test that boots the full context. Without this
 * exclusion, Spring Boot's auto-configured `SecurityFilterChain` (now on the classpath via Phase 4)
 * would return 401 before the controller method runs and every assertion would fail.
 *
 * Only one user-visible behaviour matters here : `/api/me` echoes the user resolved by
 * [AuthService.getCurrentUser] in the project's `CurrentUserDto` shape (email + displayName +
 * role). The error path (no auth) is intentionally out of scope for this slice.
 */
@WebMvcTest(AuthController::class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @MockitoBean private lateinit var authService: AuthService

  @Test
  fun `GET api me returns email displayName and role for the authenticated user`() {
    given(authService.getCurrentUser())
      .willReturn(
        User(
          id = UUID.randomUUID(),
          email = "venet.julien@gmail.com",
          displayName = "Julien Venet",
          provider = "google",
          providerId = "sub-julien",
          role = Role.ADMIN,
          createdAt = Instant.parse("2026-05-17T10:00:00Z"),
          lastLoginAt = Instant.parse("2026-05-17T10:00:00Z"),
        )
      )

    mvc
      .perform(get("/api/me"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.email").value("venet.julien@gmail.com"))
      .andExpect(jsonPath("$.displayName").value("Julien Venet"))
      .andExpect(jsonPath("$.role").value("ADMIN"))
  }

  @Test
  fun `GET api me serialises a USER role and a null displayName cleanly`() {
    // Pins the JSON shape for a freshly created user that hasn't been given a Google display
    // name yet (rare but observed during account-recovery flows). The frontend tolerates a null
    // displayName by falling back to the email prefix — that contract starts here on the
    // back-end side.
    given(authService.getCurrentUser())
      .willReturn(
        User(
          id = UUID.randomUUID(),
          email = "alice@example.com",
          displayName = null,
          provider = "google",
          providerId = "sub-alice",
          role = Role.USER,
        )
      )

    mvc
      .perform(get("/api/me"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.email").value("alice@example.com"))
      // Default Jackson config serialises null fields, so the key is present with a null value.
      // The frontend reads it as `null` and falls back to the email prefix.
      .andExpect(jsonPath("$.displayName").value(nullValue()))
      .andExpect(jsonPath("$.role").value("USER"))
  }

  @Test
  fun `GET api me exposes the user's theme and language preferences`() {
    given(authService.getCurrentUser())
      .willReturn(
        User(
          id = UUID.randomUUID(),
          email = "venet.julien@gmail.com",
          displayName = "Julien Venet",
          provider = "google",
          providerId = "sub-julien",
          role = Role.ADMIN,
          theme = "light",
          language = "en",
        )
      )

    mvc
      .perform(get("/api/me"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.theme").value("light"))
      .andExpect(jsonPath("$.language").value("en"))
  }

  @Test
  fun `PUT api me preferences echoes the refreshed user`() {
    given(authService.updatePreferences("light", "en"))
      .willReturn(
        User(
          id = UUID.randomUUID(),
          email = "venet.julien@gmail.com",
          displayName = "Julien Venet",
          provider = "google",
          providerId = "sub-julien",
          role = Role.ADMIN,
          theme = "light",
          language = "en",
        )
      )

    mvc
      .perform(
        put("/api/me/preferences")
          .contentType(MediaType.APPLICATION_JSON)
          .content("""{"theme":"light","language":"en"}""")
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.theme").value("light"))
      .andExpect(jsonPath("$.language").value("en"))
  }
}
