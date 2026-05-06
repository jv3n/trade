package com.portfolioai.config.infrastructure.http

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.config.application.dto.TestConfigResult
import com.portfolioai.config.infrastructure.ConfigTestClient
import com.portfolioai.shared.GlobalExceptionHandler
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [ConfigController]. The runtime config endpoints are simple CRUD on top
 * of [AppConfigService] — every test in this file pins one user-visible behaviour :
 * - **GET masks secret values** so a refresh of the page or a screenshot doesn't leak the API key.
 * - **GET reports overridden state** — the UI uses this to render "Reset to default" only when an
 *   override actually exists.
 * - **PUT trims the value** so a copy-paste with trailing whitespace doesn't store a broken key.
 * - **PUT rejects a blank value** with 400 — clearing a value goes through DELETE, the two paths
 *   stay distinct so the audit log is unambiguous.
 * - **DELETE returns 204** even if the override didn't exist (idempotent reset — no need for the
 *   front to check first).
 * - **POST /test/{provider}** delegates to [ConfigTestClient] and surfaces its `(ok, message)`
 *   shape unchanged.
 */
@WebMvcTest(ConfigController::class, GlobalExceptionHandler::class)
class ConfigControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var json: ObjectMapper
  @MockitoBean private lateinit var service: AppConfigService
  @MockitoBean private lateinit var testClient: ConfigTestClient

  // ---------------------------------------------------------------------- list

  @Test
  fun `GET config returns the seven known keys with secrets masked and enums carrying allowedValues`() {
    // Order is alphabetical on key — `analyst.provider` < `earnings.provider` <
    // `market.cache.ttl-minutes` < `market.finnhub.api-key` < `market.provider` <
    // `market.twelvedata.api-key` < `news.provider`.
    given(service.getString(ConfigKeys.ANALYST_PROVIDER)).willReturn("mock")
    given(service.getString(ConfigKeys.EARNINGS_PROVIDER)).willReturn("mock")
    given(service.getString(ConfigKeys.CACHE_TTL_MINUTES)).willReturn("30")
    given(service.getString(ConfigKeys.FINNHUB_API_KEY)).willReturn("")
    given(service.getString(ConfigKeys.NEWS_PROVIDER)).willReturn("mock")
    given(service.getString(ConfigKeys.MARKET_PROVIDER)).willReturn("twelvedata")
    given(service.getString(ConfigKeys.TWELVEDATA_API_KEY)).willReturn("real-key")
    given(service.defaultFor(ConfigKeys.ANALYST_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.EARNINGS_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.CACHE_TTL_MINUTES)).willReturn("15")
    given(service.defaultFor(ConfigKeys.FINNHUB_API_KEY)).willReturn("")
    given(service.defaultFor(ConfigKeys.NEWS_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.MARKET_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.TWELVEDATA_API_KEY)).willReturn("env-default")
    given(service.isOverridden(ConfigKeys.ANALYST_PROVIDER)).willReturn(false)
    given(service.isOverridden(ConfigKeys.EARNINGS_PROVIDER)).willReturn(false)
    given(service.isOverridden(ConfigKeys.CACHE_TTL_MINUTES)).willReturn(true)
    given(service.isOverridden(ConfigKeys.FINNHUB_API_KEY)).willReturn(false)
    given(service.isOverridden(ConfigKeys.NEWS_PROVIDER)).willReturn(false)
    given(service.isOverridden(ConfigKeys.MARKET_PROVIDER)).willReturn(true)
    given(service.isOverridden(ConfigKeys.TWELVEDATA_API_KEY)).willReturn(true)

    mvc
      .perform(get("/api/config"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(7))
      // Analyst provider : ENUM, allowedValues drives the toggle group. First alphabetically.
      .andExpect(jsonPath("$[0].key").value(ConfigKeys.ANALYST_PROVIDER))
      .andExpect(jsonPath("$[0].type").value("ENUM"))
      .andExpect(jsonPath("$[0].currentValue").value("mock"))
      .andExpect(jsonPath("$[0].allowedValues[0]").value("mock"))
      .andExpect(jsonPath("$[0].allowedValues[1]").value("finnhub"))
      // Earnings provider : ENUM, second alphabetically.
      .andExpect(jsonPath("$[1].key").value(ConfigKeys.EARNINGS_PROVIDER))
      .andExpect(jsonPath("$[1].type").value("ENUM"))
      .andExpect(jsonPath("$[1].currentValue").value("mock"))
      .andExpect(jsonPath("$[1].allowedValues[0]").value("mock"))
      .andExpect(jsonPath("$[1].allowedValues[1]").value("finnhub"))
      // Cache TTL : INT key, value exposed as-is.
      .andExpect(jsonPath("$[2].key").value(ConfigKeys.CACHE_TTL_MINUTES))
      .andExpect(jsonPath("$[2].type").value("INT"))
      .andExpect(jsonPath("$[2].currentValue").value("30"))
      .andExpect(jsonPath("$[2].defaultValue").value("15"))
      // Finnhub key : SECRET, no value set.
      .andExpect(jsonPath("$[3].key").value(ConfigKeys.FINNHUB_API_KEY))
      .andExpect(jsonPath("$[3].type").value("SECRET"))
      .andExpect(jsonPath("$[3].hasValue").value(false))
      // Market provider : ENUM, currently overridden to twelvedata.
      .andExpect(jsonPath("$[4].key").value(ConfigKeys.MARKET_PROVIDER))
      .andExpect(jsonPath("$[4].type").value("ENUM"))
      .andExpect(jsonPath("$[4].currentValue").value("twelvedata"))
      .andExpect(jsonPath("$[4].defaultValue").value("mock"))
      .andExpect(jsonPath("$[4].isOverridden").value(true))
      .andExpect(jsonPath("$[4].allowedValues[0]").value("mock"))
      .andExpect(jsonPath("$[4].allowedValues[1]").value("twelvedata"))
      // Twelve Data key : SECRET with a value — masked.
      .andExpect(jsonPath("$[5].key").value(ConfigKeys.TWELVEDATA_API_KEY))
      .andExpect(jsonPath("$[5].type").value("SECRET"))
      .andExpect(jsonPath("$[5].currentValue").doesNotExist())
      .andExpect(jsonPath("$[5].defaultValue").doesNotExist())
      .andExpect(jsonPath("$[5].hasValue").value(true))
      .andExpect(jsonPath("$[5].isOverridden").value(true))
      // News provider : ENUM, allowedValues drives the toggle group.
      .andExpect(jsonPath("$[6].key").value(ConfigKeys.NEWS_PROVIDER))
      .andExpect(jsonPath("$[6].type").value("ENUM"))
      .andExpect(jsonPath("$[6].currentValue").value("mock"))
      .andExpect(jsonPath("$[6].allowedValues[0]").value("mock"))
      .andExpect(jsonPath("$[6].allowedValues[1]").value("finnhub"))
  }

  // ---------------------------------------------------------------------- set

  @Test
  fun `PUT config trims whitespace before storing`() {
    given(service.getString(ConfigKeys.TWELVEDATA_API_KEY)).willReturn("typed-key")
    given(service.defaultFor(ConfigKeys.TWELVEDATA_API_KEY)).willReturn("")
    given(service.isOverridden(ConfigKeys.TWELVEDATA_API_KEY)).willReturn(true)

    mvc
      .perform(
        put("/api/config/{key}", ConfigKeys.TWELVEDATA_API_KEY)
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "  typed-key  ")))
      )
      .andExpect(status().isOk)

    // Value passed to the service must be trimmed — copy-paste with trailing newline is a common
    // source of "key works in curl but not in the app" headaches.
    verify(service).set(ConfigKeys.TWELVEDATA_API_KEY, "typed-key")
  }

  @Test
  fun `PUT config returns 400 on a blank value`() {
    // Blank goes through DELETE explicitly. Surfacing 400 here keeps the two intentions distinct.
    mvc
      .perform(
        put("/api/config/{key}", ConfigKeys.CACHE_TTL_MINUTES)
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "   ")))
      )
      .andExpect(status().isBadRequest)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `PUT config returns 400 when the service rejects the value`() {
    // Out-of-range TTL or non-integer are caught in AppConfigService.validate ; the controller
    // doesn't pre-validate (single source of truth for the validation rules). We assert the 400
    // surface rather than the validation logic itself — that's covered in AppConfigServiceTest.
    org.mockito.BDDMockito.willThrow(IllegalArgumentException("must be between 5 and 60"))
      .given(service)
      .set(ConfigKeys.CACHE_TTL_MINUTES, "120")

    mvc
      .perform(
        put("/api/config/{key}", ConfigKeys.CACHE_TTL_MINUTES)
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "120")))
      )
      .andExpect(status().isBadRequest)
  }

  // ---------------------------------------------------------------------- reset

  @Test
  fun `DELETE config returns 204`() {
    mvc
      .perform(delete("/api/config/{key}", ConfigKeys.TWELVEDATA_API_KEY))
      .andExpect(status().isNoContent)

    verify(service).reset(ConfigKeys.TWELVEDATA_API_KEY)
  }

  // ---------------------------------------------------------------------- test endpoints

  @Test
  fun `POST test twelvedata returns the result from the test client`() {
    given(testClient.testTwelveData("candidate-key"))
      .willReturn(TestConfigResult(true, "OK — Twelve Data accepted the key"))

    mvc
      .perform(
        post("/api/config/test/twelvedata")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "candidate-key")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.ok").value(true))
      .andExpect(jsonPath("$.message").value("OK — Twelve Data accepted the key"))
  }

  @Test
  fun `POST test finnhub returns the result from the test client`() {
    given(testClient.testFinnhub("candidate-key"))
      .willReturn(TestConfigResult(false, "Invalid Finnhub API key"))

    mvc
      .perform(
        post("/api/config/test/finnhub")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "candidate-key")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.ok").value(false))
      .andExpect(jsonPath("$.message").value("Invalid Finnhub API key"))
  }
}
