package com.portfolioai.e2e

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.auth.domain.Role
import com.portfolioai.auth.domain.User
import com.portfolioai.auth.infrastructure.persistence.UserRepository
import com.portfolioai.auth.infrastructure.security.AppOAuth2User
import com.portfolioai.stats.infrastructure.persistence.StatEntryRepository
import java.time.LocalDate
import java.util.UUID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * Pins the end-to-end suite's way in (#367), under the `e2e` profile :
 * - **login** opens a real session for a brand-new user, without a CSRF token (the suite has none
 *   yet) and without the `local` seeder filling the account ;
 * - **delete** removes that user with their data — a stat carrying a trade included, the one link
 *   (`trade_entry → stat_entry`, ON DELETE RESTRICT) a plain cascade can trip on ;
 * - **only an e2e user** can be deleted : Tilt runs `local,e2e`, so the developer's own session
 *   reaches the route too.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("e2e")
class E2eSessionIntegrationTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var users: UserRepository
  @Autowired private lateinit var stats: StatEntryRepository
  @Autowired private lateinit var json: ObjectMapper

  @Test
  fun `login opens a session for a new, empty user`() {
    val session = login()

    mvc
      .perform(get("/api/me").session(session))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.role").value("USER"))
    mvc
      .perform(get("/api/stats").session(session))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.totalElements").value(0))
  }

  @Test
  fun `two logins give two different users`() {
    val first = email(login())
    val second = email(login())

    assertFalse(first == second)
  }

  @Test
  fun `delete removes the user with a stat and its trade`() {
    val session = login()
    val email = email(session)
    val stat =
      mvc
        .perform(
          post("/api/stats")
            .session(session)
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content(
              """{"tradeDate":"${LocalDate.now()}","ticker":"KTTA","previousClose":2.65,"pmOpen":4.05,"pmHigh":4.65}"""
            )
        )
        .andExpect(status().isCreated)
        .andReturn()
        .response
        .contentAsString
    val statId = json.readTree(stat)["id"].asText()
    mvc
      .perform(post("/api/stats/$statId/trade").session(session).with(csrf()))
      .andExpect(status().isCreated)

    mvc.perform(delete("/api/e2e/me").session(session).with(csrf())).andExpect(status().isNoContent)

    assertEquals(null, users.findByEmail(email))
    assertFalse(stats.existsById(UUID.fromString(statId)))
  }

  @Test
  fun `a user who signed in through Google cannot be deleted`() {
    val real =
      users.save(
        User(
          email = "trader-${UUID.randomUUID()}@test.local",
          provider = "google",
          role = Role.USER,
        )
      )
    val authorities = listOf(SimpleGrantedAuthority("ROLE_USER"))
    val principal = AppOAuth2User(real.id, real.email, mapOf("sub" to "g-1"), authorities)

    mvc
      .perform(
        delete("/api/e2e/me")
          .with(authentication(OAuth2AuthenticationToken(principal, authorities, "google")))
          .with(csrf())
      )
      .andExpect(status().isForbidden)
    assertEquals(real.id, users.findByEmail(real.email)?.id)
  }

  private fun login(): MockHttpSession =
    mvc.perform(post("/api/e2e/login")).andExpect(status().isOk).andReturn().request.session
      as MockHttpSession

  private fun email(session: MockHttpSession): String {
    val me = mvc.perform(get("/api/me").session(session)).andReturn().response.contentAsString
    return json.readTree(me)["email"].asText()
  }
}
