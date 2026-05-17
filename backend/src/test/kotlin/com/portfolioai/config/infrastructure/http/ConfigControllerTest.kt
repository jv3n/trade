package com.portfolioai.config.infrastructure.http

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.application.dto.LoadedModelDto
import com.portfolioai.analysis.application.dto.OllamaStatusDto
import com.portfolioai.analysis.infrastructure.llm.OllamaStatusService
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.config.application.dto.TestConfigResult
import com.portfolioai.config.infrastructure.ConfigTestClient
import com.portfolioai.shared.GlobalExceptionHandler
import java.time.Instant
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
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
@AutoConfigureMockMvc(addFilters = false)
class ConfigControllerTest {

  @Autowired private lateinit var mvc: MockMvc
  @Autowired private lateinit var json: ObjectMapper
  @MockitoBean private lateinit var service: AppConfigService
  @MockitoBean private lateinit var testClient: ConfigTestClient
  @MockitoBean private lateinit var ollamaStatusService: OllamaStatusService

  // ---------------------------------------------------------------------- list

  @Test
  fun `GET config returns the twelve known keys with secrets masked and enums carrying allowedValues`() {
    // Order is alphabetical on key. With the Anthropic key SECRET added in Phase 2.5 the layout is
    // :
    // [0]  analyst.provider       ENUM
    // [1]  anthropic.api.key      SECRET (Anthropic API key, masked)
    // [2]  anthropic.api.model    STRING (Claude model name)
    // [3]  earnings.provider      ENUM
    // [4]  llm.provider           ENUM   (claude / ollama)
    // [5]  llm.timeout-seconds    INT    (v1.5 — slider 60..900)
    // [6]  market.cache.ttl-min   INT
    // [7]  market.finnhub.key     SECRET
    // [8]  market.provider        ENUM
    // [9]  market.twelvedata.key  SECRET
    // [10] news.provider          ENUM
    // [11] ollama.model           STRING (Ollama model tag)
    given(service.getString(ConfigKeys.ANALYST_PROVIDER)).willReturn("mock")
    given(service.getString(ConfigKeys.ANTHROPIC_API_KEY)).willReturn("sk-ant-real")
    given(service.getString(ConfigKeys.ANTHROPIC_API_MODEL)).willReturn("claude-opus-4-6")
    given(service.getString(ConfigKeys.EARNINGS_PROVIDER)).willReturn("mock")
    given(service.getString(ConfigKeys.LLM_PROVIDER)).willReturn("ollama")
    given(service.getString(ConfigKeys.LLM_TIMEOUT_SECONDS)).willReturn("600")
    given(service.getString(ConfigKeys.CACHE_TTL_MINUTES)).willReturn("30")
    given(service.getString(ConfigKeys.FINNHUB_API_KEY)).willReturn("")
    given(service.getString(ConfigKeys.MARKET_PROVIDER)).willReturn("twelvedata")
    given(service.getString(ConfigKeys.TWELVEDATA_API_KEY)).willReturn("real-key")
    given(service.getString(ConfigKeys.NEWS_PROVIDER)).willReturn("mock")
    given(service.getString(ConfigKeys.OLLAMA_MODEL)).willReturn("qwen2.5:3b")
    given(service.defaultFor(ConfigKeys.ANALYST_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.ANTHROPIC_API_KEY)).willReturn("env-anthropic")
    given(service.defaultFor(ConfigKeys.ANTHROPIC_API_MODEL)).willReturn("claude-opus-4-6")
    given(service.defaultFor(ConfigKeys.EARNINGS_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.LLM_PROVIDER)).willReturn("claude")
    given(service.defaultFor(ConfigKeys.LLM_TIMEOUT_SECONDS)).willReturn("400")
    given(service.defaultFor(ConfigKeys.CACHE_TTL_MINUTES)).willReturn("15")
    given(service.defaultFor(ConfigKeys.FINNHUB_API_KEY)).willReturn("")
    given(service.defaultFor(ConfigKeys.MARKET_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.TWELVEDATA_API_KEY)).willReturn("env-default")
    given(service.defaultFor(ConfigKeys.NEWS_PROVIDER)).willReturn("mock")
    given(service.defaultFor(ConfigKeys.OLLAMA_MODEL)).willReturn("qwen2.5:3b")
    given(service.isOverridden(ConfigKeys.ANALYST_PROVIDER)).willReturn(false)
    given(service.isOverridden(ConfigKeys.ANTHROPIC_API_KEY)).willReturn(false)
    given(service.isOverridden(ConfigKeys.ANTHROPIC_API_MODEL)).willReturn(false)
    given(service.isOverridden(ConfigKeys.EARNINGS_PROVIDER)).willReturn(false)
    given(service.isOverridden(ConfigKeys.LLM_PROVIDER)).willReturn(true)
    given(service.isOverridden(ConfigKeys.LLM_TIMEOUT_SECONDS)).willReturn(true)
    given(service.isOverridden(ConfigKeys.CACHE_TTL_MINUTES)).willReturn(true)
    given(service.isOverridden(ConfigKeys.FINNHUB_API_KEY)).willReturn(false)
    given(service.isOverridden(ConfigKeys.MARKET_PROVIDER)).willReturn(true)
    given(service.isOverridden(ConfigKeys.TWELVEDATA_API_KEY)).willReturn(true)
    given(service.isOverridden(ConfigKeys.NEWS_PROVIDER)).willReturn(false)
    given(service.isOverridden(ConfigKeys.OLLAMA_MODEL)).willReturn(false)

    mvc
      .perform(get("/api/config"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.length()").value(12))
      // Analyst provider : ENUM, allowedValues drives the toggle group.
      .andExpect(jsonPath("$[0].key").value(ConfigKeys.ANALYST_PROVIDER))
      .andExpect(jsonPath("$[0].type").value("ENUM"))
      .andExpect(jsonPath("$[0].allowedValues[1].value").value("finnhub"))
      // Anthropic key : SECRET — value masked even though the YAML default has one.
      .andExpect(jsonPath("$[1].key").value(ConfigKeys.ANTHROPIC_API_KEY))
      .andExpect(jsonPath("$[1].type").value("SECRET"))
      .andExpect(jsonPath("$[1].currentValue").doesNotExist())
      .andExpect(jsonPath("$[1].defaultValue").doesNotExist())
      .andExpect(jsonPath("$[1].hasValue").value(true))
      .andExpect(jsonPath("$[1].isOverridden").value(false))
      // Anthropic model : STRING — free-form (the front renders an autocomplete).
      .andExpect(jsonPath("$[2].key").value(ConfigKeys.ANTHROPIC_API_MODEL))
      .andExpect(jsonPath("$[2].type").value("STRING"))
      .andExpect(jsonPath("$[2].currentValue").value("claude-opus-4-6"))
      .andExpect(jsonPath("$[2].defaultValue").value("claude-opus-4-6"))
      .andExpect(jsonPath("$[2].isOverridden").value(false))
      // Earnings provider : ENUM.
      .andExpect(jsonPath("$[3].key").value(ConfigKeys.EARNINGS_PROVIDER))
      .andExpect(jsonPath("$[3].type").value("ENUM"))
      // LLM provider : ENUM with mock / claude / ollama, currently overridden to ollama. The
      // `mock` value was added 2026-05-15 with MockLlmClient so the app runs without API key —
      // ordering pinned here matches `ConfigKeys.ENUM_KEYS[LLM_PROVIDER]` (mock first because the
      // front renders the toggle group in that order and "no-key onboarding" is the leftmost
      // affordance).
      .andExpect(jsonPath("$[4].key").value(ConfigKeys.LLM_PROVIDER))
      .andExpect(jsonPath("$[4].type").value("ENUM"))
      .andExpect(jsonPath("$[4].currentValue").value("ollama"))
      .andExpect(jsonPath("$[4].defaultValue").value("claude"))
      .andExpect(jsonPath("$[4].isOverridden").value(true))
      .andExpect(jsonPath("$[4].allowedValues.length()").value(3))
      .andExpect(jsonPath("$[4].allowedValues[0].value").value("mock"))
      .andExpect(jsonPath("$[4].allowedValues[1].value").value("claude"))
      .andExpect(jsonPath("$[4].allowedValues[2].value").value("ollama"))
      // LLM timeout : INT slider, default 400, overridden to 600 here.
      .andExpect(jsonPath("$[5].key").value(ConfigKeys.LLM_TIMEOUT_SECONDS))
      .andExpect(jsonPath("$[5].type").value("INT"))
      .andExpect(jsonPath("$[5].currentValue").value("600"))
      .andExpect(jsonPath("$[5].defaultValue").value("400"))
      .andExpect(jsonPath("$[5].isOverridden").value(true))
      // Cache TTL : INT key, value exposed as-is.
      .andExpect(jsonPath("$[6].key").value(ConfigKeys.CACHE_TTL_MINUTES))
      .andExpect(jsonPath("$[6].type").value("INT"))
      .andExpect(jsonPath("$[6].currentValue").value("30"))
      .andExpect(jsonPath("$[6].defaultValue").value("15"))
      // Finnhub key : SECRET, no value set.
      .andExpect(jsonPath("$[7].key").value(ConfigKeys.FINNHUB_API_KEY))
      .andExpect(jsonPath("$[7].type").value("SECRET"))
      .andExpect(jsonPath("$[7].hasValue").value(false))
      // Market provider : ENUM, currently overridden to twelvedata.
      .andExpect(jsonPath("$[8].key").value(ConfigKeys.MARKET_PROVIDER))
      .andExpect(jsonPath("$[8].type").value("ENUM"))
      .andExpect(jsonPath("$[8].currentValue").value("twelvedata"))
      // Twelve Data key : SECRET with a value — masked.
      .andExpect(jsonPath("$[9].key").value(ConfigKeys.TWELVEDATA_API_KEY))
      .andExpect(jsonPath("$[9].type").value("SECRET"))
      .andExpect(jsonPath("$[9].currentValue").doesNotExist())
      .andExpect(jsonPath("$[9].hasValue").value(true))
      .andExpect(jsonPath("$[9].isOverridden").value(true))
      // News provider : ENUM.
      .andExpect(jsonPath("$[10].key").value(ConfigKeys.NEWS_PROVIDER))
      .andExpect(jsonPath("$[10].type").value("ENUM"))
      // Ollama model : STRING — free-form (the Ollama ecosystem changes too fast to whitelist).
      .andExpect(jsonPath("$[11].key").value(ConfigKeys.OLLAMA_MODEL))
      .andExpect(jsonPath("$[11].type").value("STRING"))
      .andExpect(jsonPath("$[11].currentValue").value("qwen2.5:3b"))
      .andExpect(jsonPath("$[11].defaultValue").value("qwen2.5:3b"))
      .andExpect(jsonPath("$[11].allowedValues").doesNotExist())
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

  @Test
  fun `POST test anthropic returns the result from the test client`() {
    // Mirror of `/test/twelvedata` and `/test/finnhub` — the candidate Anthropic key is round-
    // tripped to Claude with the currently configured model. See
    // [ConfigTestClient.testAnthropicKey].
    given(testClient.testAnthropicKey("sk-ant-candidate"))
      .willReturn(TestConfigResult(true, "OK — Claude (claude-opus-4-6) replied in 1.4s"))

    mvc
      .perform(
        post("/api/config/test/anthropic")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("value" to "sk-ant-candidate")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.ok").value(true))
      .andExpect(jsonPath("$.message").value("OK — Claude (claude-opus-4-6) replied in 1.4s"))
  }

  @Test
  fun `POST test llm forwards provider plus model and surfaces the result`() {
    // The LLM probe takes both fields — the controller trims them and hands them off to the test
    // client. Whitespace from copy-paste should not break a probe ; we verify the trim once here
    // (the equivalent path for API keys is covered by the trim test above).
    given(testClient.testLlm("ollama", "qwen2.5:3b"))
      .willReturn(TestConfigResult(true, "OK — Ollama (qwen2.5:3b) replied in 1.2s"))

    mvc
      .perform(
        post("/api/config/test/llm")
          .contentType(MediaType.APPLICATION_JSON)
          .content(
            json.writeValueAsString(mapOf("provider" to "  ollama  ", "model" to "  qwen2.5:3b  "))
          )
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.ok").value(true))
      .andExpect(jsonPath("$.message").value("OK — Ollama (qwen2.5:3b) replied in 1.2s"))

    verify(testClient).testLlm("ollama", "qwen2.5:3b")
  }

  // ---------------------------------------------------------------------- llm status

  @Test
  fun `GET llm status forwards the daemon snapshot to the front`() {
    // The endpoint is a thin proxy over OllamaStatusService.probe — verify the JSON shape (panel
    // contract) and that fail-soft snapshots round-trip with the right HTTP code (200, never 503,
    // because the panel polls and a 503 would put the whole settings page in error state).
    given(ollamaStatusService.probe())
      .willReturn(
        OllamaStatusDto(
          daemonReachable = true,
          baseUrl = "http://localhost:11434",
          latencyMs = 12,
          loadedModels =
            listOf(
              LoadedModelDto(
                name = "qwen2.5:3b",
                expiresAt = Instant.parse("2026-05-08T15:30:00Z"),
                sizeVramBytes = 2_008_000_000L,
              )
            ),
          availableModels = listOf("llama3.2:3b", "qwen2.5:3b"),
          errorMessage = null,
        )
      )

    mvc
      .perform(get("/api/config/llm/status"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.daemonReachable").value(true))
      .andExpect(jsonPath("$.baseUrl").value("http://localhost:11434"))
      .andExpect(jsonPath("$.latencyMs").value(12))
      .andExpect(jsonPath("$.availableModels.length()").value(2))
      .andExpect(jsonPath("$.availableModels[0]").value("llama3.2:3b"))
      .andExpect(jsonPath("$.loadedModels.length()").value(1))
      .andExpect(jsonPath("$.loadedModels[0].name").value("qwen2.5:3b"))
      .andExpect(jsonPath("$.loadedModels[0].sizeVramBytes").value(2_008_000_000L))
  }

  @Test
  fun `GET llm status surfaces fail-soft snapshots with HTTP 200 and daemonReachable=false`() {
    given(ollamaStatusService.probe())
      .willReturn(
        OllamaStatusDto(
          daemonReachable = false,
          baseUrl = "http://localhost:11434",
          latencyMs = null,
          loadedModels = emptyList(),
          availableModels = emptyList(),
          errorMessage = "Unreachable : Connection refused",
        )
      )

    mvc
      .perform(get("/api/config/llm/status"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.daemonReachable").value(false))
      .andExpect(jsonPath("$.errorMessage").value("Unreachable : Connection refused"))
  }

  @Test
  fun `POST llm unload-model trims and forwards the model and surfaces the fresh snapshot`() {
    // The endpoint is a thin wrapper over OllamaStatusService.unloadModel — verify the trim,
    // the forward, and the wire shape (the panel re-renders directly from the response, so the
    // round-trip must carry the post-unload daemon state).
    given(ollamaStatusService.unloadModel("qwen2.5:3b"))
      .willReturn(
        OllamaStatusDto(
          daemonReachable = true,
          baseUrl = "http://localhost:11434",
          latencyMs = 9,
          loadedModels = emptyList(), // VRAM now empty after the unload took effect
          availableModels = listOf("qwen2.5:3b"),
          errorMessage = null,
        )
      )

    mvc
      .perform(
        post("/api/config/llm/unload-model")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("model" to "  qwen2.5:3b  ")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.daemonReachable").value(true))
      .andExpect(jsonPath("$.loadedModels.length()").value(0))
      .andExpect(jsonPath("$.availableModels[0]").value("qwen2.5:3b"))

    verify(ollamaStatusService).unloadModel("qwen2.5:3b")
  }

  @Test
  fun `POST llm pull-model trims and forwards the model name and surfaces the fresh snapshot`() {
    // Mirror of unload-model — pull blocks the request thread for 1-3 min in real usage with
    // `stream: false`, but the controller is a pure forward so we just assert the wiring and
    // the response shape. The new model landing in `availableModels` is what the dialog uses
    // to render success.
    given(ollamaStatusService.pullModel("mistral:7b"))
      .willReturn(
        OllamaStatusDto(
          daemonReachable = true,
          baseUrl = "http://localhost:11434",
          latencyMs = 14,
          loadedModels = emptyList(),
          availableModels = listOf("mistral:7b", "qwen2.5:3b"),
          errorMessage = null,
        )
      )

    mvc
      .perform(
        post("/api/config/llm/pull-model")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("model" to "  mistral:7b  ")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.daemonReachable").value(true))
      .andExpect(jsonPath("$.availableModels.length()").value(2))
      .andExpect(jsonPath("$.availableModels[0]").value("mistral:7b"))

    verify(ollamaStatusService).pullModel("mistral:7b")
  }

  @Test
  fun `POST llm delete-model trims and forwards the model name and surfaces the fresh snapshot`() {
    given(ollamaStatusService.deleteModel("mistral:7b"))
      .willReturn(
        OllamaStatusDto(
          daemonReachable = true,
          baseUrl = "http://localhost:11434",
          latencyMs = 11,
          loadedModels = emptyList(),
          // The deleted model is gone from available — the dialog re-renders without its chip.
          availableModels = listOf("qwen2.5:3b"),
          errorMessage = null,
        )
      )

    mvc
      .perform(
        post("/api/config/llm/delete-model")
          .contentType(MediaType.APPLICATION_JSON)
          .content(json.writeValueAsString(mapOf("model" to "  mistral:7b  ")))
      )
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.daemonReachable").value(true))
      .andExpect(jsonPath("$.availableModels.length()").value(1))
      .andExpect(jsonPath("$.availableModels[0]").value("qwen2.5:3b"))

    verify(ollamaStatusService).deleteModel("mistral:7b")
  }
}
