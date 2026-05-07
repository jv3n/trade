package com.portfolioai.config.infrastructure

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Tests on the input-validation branches of [ConfigTestClient.testLlm] — the paths that don't
 * require a live HTTP probe. The actual probe paths (`probeClaude`, `probeOllama`) are exercised
 * end-to-end when the user clicks "Tester" in the UI ; mocking the underlying [RestClient] would
 * pin the implementation to a specific call shape and slow refactors down without catching real
 * regressions.
 *
 * What we pin :
 * - **Blank model** → fail fast, never hit the network. The user typed nothing, the UI button
 *   should already be disabled, but the backend defends in depth.
 * - **Unknown provider** → fail fast with a precise error, not a 500. Catches a typo coming from
 *   the controller body before we burn an Anthropic call on a bogus path.
 * - **Missing Anthropic key** → Claude probe returns a clear "set your YAML" message instead of
 *   posting to anthropic.com with an empty `x-api-key` header (which would just 401 with a less
 *   useful message).
 */
class ConfigTestClientTest {

  private fun newClient(anthropicApiKey: String = "test-anthropic-key"): ConfigTestClient =
    ConfigTestClient(
      twelveDataBaseUrl = "https://api.twelvedata.com",
      finnhubBaseUrl = "https://finnhub.io/api/v1",
      anthropicApiKey = anthropicApiKey,
      ollamaBaseUrl = "http://localhost:11434",
    )

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
    // Without an Anthropic key in YAML the Claude probe would post with an empty `x-api-key` and
    // get a 401 — surfaced as a confusing HTTP error. The early check here gives the user an
    // actionable message ("set your YAML key first") before we even try the call.
    val result = newClient(anthropicApiKey = "").testLlm("claude", "claude-opus-4-6")
    assertFalse(result.ok)
    assertTrue(result.message.contains("Anthropic API key"))
  }
}
