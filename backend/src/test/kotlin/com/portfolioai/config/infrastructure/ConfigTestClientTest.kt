package com.portfolioai.config.infrastructure

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock

/**
 * Tests on the input-validation branches of [ConfigTestClient.testLlm] / [testAnthropicKey] — the
 * paths that don't require a live HTTP probe. The actual probe paths (`probeClaude`, `probeOllama`)
 * are exercised end-to-end when the user clicks "Tester" in the UI ; mocking the underlying
 * [org.springframework.web.client.RestClient] would pin the implementation to a specific call shape
 * and slow refactors down without catching real regressions.
 *
 * What we pin :
 * - **Blank model** → fail fast, never hit the network. The user typed nothing, the UI button
 *   should already be disabled, but the backend defends in depth.
 * - **Unknown provider** → fail fast with a precise error, not a 500. Catches a typo coming from
 *   the controller body before we burn an Anthropic call on a bogus path.
 * - **Missing Anthropic key on `testLlm("claude")`** → Claude probe returns a clear "not
 *   configured" message instead of posting to anthropic.com with an empty `x-api-key` header (which
 *   would just 401 with a less useful message). Since Phase 2.5 the key is read from
 *   [AppConfigService] per-call (not from `@Value`), so the missing-key path is tested by mocking
 *   the service to return blank.
 * - **Blank candidate on `testAnthropicKey`** → mirror of the Twelve Data / Finnhub fail-fast on
 *   blank input.
 */
class ConfigTestClientTest {

  private fun newClient(
    anthropicApiKey: String = "test-anthropic-key",
    anthropicModel: String = "claude-opus-4-6",
  ): ConfigTestClient {
    val appConfig: AppConfigService = mock {
      on { getString(ConfigKeys.ANTHROPIC_API_KEY) } doReturn anthropicApiKey
      on { getString(ConfigKeys.ANTHROPIC_API_MODEL) } doReturn anthropicModel
    }
    return ConfigTestClient(
      appConfig = appConfig,
      twelveDataBaseUrl = "https://api.twelvedata.com",
      finnhubBaseUrl = "https://finnhub.io/api/v1",
      polygonBaseUrl = "https://api.massive.com",
      fmpBaseUrl = "https://financialmodelingprep.com",
      ollamaBaseUrl = "http://localhost:11434",
    )
  }

  @Test
  fun `testLlm rejects a blank model name`() {
    val result = newClient().testLlm("claude", "   ")
    assertFalse(result.ok)
    assertEquals("Model name is blank", result.message)
  }

  @Test
  fun `testLlm rejects an unknown provider`() {
    val result = newClient().testLlm("openai", "gpt-4o")
    assertFalse(result.ok)
    assertTrue(result.message.contains("Unknown LLM provider"))
    assertTrue(result.message.contains("openai"))
  }

  @Test
  fun `testLlm flags a missing Anthropic key on Claude probe`() {
    // Without an Anthropic key configured the Claude probe would post with an empty `x-api-key`
    // and get a 401 — surfaced as a confusing HTTP error. The early check gives the user an
    // actionable message ("not configured") before we even try the call.
    val result = newClient(anthropicApiKey = "").testLlm("claude", "claude-opus-4-6")
    assertFalse(result.ok)
    assertTrue(result.message.contains("Anthropic API key"))
  }

  @Test
  fun `testAnthropicKey rejects a blank candidate before any network call`() {
    // Mirror of testTwelveData / testFinnhub on blank input. The candidate path doesn't read from
    // AppConfigService so a blank candidate is the only way to short-circuit cleanly.
    val result = newClient().testAnthropicKey("   ")
    assertFalse(result.ok)
    assertEquals("API key is blank", result.message)
  }
}
