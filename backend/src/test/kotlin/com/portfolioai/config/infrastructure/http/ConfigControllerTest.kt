package com.portfolioai.config.infrastructure.http

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.shared.GlobalExceptionHandler
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.willThrow
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [ConfigController]. The runtime config endpoints are simple CRUD on top
 * of [AppConfigService] — every test pins one user-visible behaviour :
 * - **GET lists the login whitelist** typed as `EMAILS` with its overridden state.
 * - **PUT trims the value** so a copy-paste with trailing whitespace doesn't store a broken list.
 * - **PUT rejects a blank value** with 400 — clearing goes through DELETE, the two paths stay
 *   distinct.
 * - **DELETE returns 204** even if the override didn't exist (idempotent reset).
 */
@WebMvcTest(ConfigController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class ConfigControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var json: ObjectMapper
  @MockitoBean private lateinit var service: AppConfigService

  @Test
  fun `GET config lists the allowed emails entry typed as EMAILS`() {
    given(service.getString(ConfigKeys.ALLOWED_EMAILS)).willReturn("alice@example.com")
    given(service.defaultFor(ConfigKeys.ALLOWED_EMAILS)).willReturn("")
    given(service.isOverridden(ConfigKeys.ALLOWED_EMAILS)).willReturn(true)

    mvc
      .perform(get("/api/config"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(1))
      .andExpect(jsonPath("$[0].key").value(ConfigKeys.ALLOWED_EMAILS))
      .andExpect(jsonPath("$[0].type").value("EMAILS"))
      .andExpect(jsonPath("$[0].currentValue").value("alice@example.com"))
      .andExpect(jsonPath("$[0].hasValue").value(true))
      .andExpect(jsonPath("$[0].isOverridden").value(true))
  }

  @Test
  fun `PUT config trims whitespace before storing`() {
    given(service.getString(ConfigKeys.ALLOWED_EMAILS)).willReturn("alice@example.com")
    given(service.defaultFor(ConfigKeys.ALLOWED_EMAILS)).willReturn("")
    given(service.isOverridden(ConfigKeys.ALLOWED_EMAILS)).willReturn(true)

    mvc
      .perform(
        put("/api/config/{key}", ConfigKeys.ALLOWED_EMAILS)
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "  alice@example.com  ")))
      )
      .andExpect(status().isOk)

    verify(service).set(ConfigKeys.ALLOWED_EMAILS, "alice@example.com")
  }

  @Test
  fun `PUT config returns 400 on a blank value`() {
    mvc
      .perform(
        put("/api/config/{key}", ConfigKeys.ALLOWED_EMAILS)
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "   ")))
      )
      .andExpect(status().isBadRequest)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `PUT config returns 400 when the service rejects the value`() {
    // Validation lives in AppConfigService ; the controller only surfaces the 400.
    willThrow(IllegalArgumentException("malformed entry"))
      .given(service)
      .set(ConfigKeys.ALLOWED_EMAILS, "not-an-email")

    mvc
      .perform(
        put("/api/config/{key}", ConfigKeys.ALLOWED_EMAILS)
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "not-an-email")))
      )
      .andExpect(status().isBadRequest)
  }

  @Test
  fun `DELETE config returns 204`() {
    mvc
      .perform(delete("/api/config/{key}", ConfigKeys.ALLOWED_EMAILS))
      .andExpect(status().isNoContent)

    verify(service).reset(ConfigKeys.ALLOWED_EMAILS)
  }
}
