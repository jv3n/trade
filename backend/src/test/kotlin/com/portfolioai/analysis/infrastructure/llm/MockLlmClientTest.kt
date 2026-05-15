package com.portfolioai.analysis.infrastructure.llm

import com.fasterxml.jackson.databind.ObjectMapper
import com.portfolioai.analysis.application.TickerNarrativeParser
import com.portfolioai.analysis.domain.Sentiment
import com.portfolioai.shared.UpstreamUnavailableException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on [MockLlmClient] — the third LLM adapter introduced in #4 partial (livré 2026-05-15) so
 * the full narrative pipeline runs deterministically without any API key or Ollama daemon. Pinned
 * properties matter not because the mock is "real" code paying its keep, but because it's the
 * smoke-test substrate the rest of the codebase depends on : if the mock drifts from the parser
 * contract, the CI integration tests on `BackendApplicationTests` silently lose coverage.
 *
 * What we pin :
 * - **Parser-compatible JSON shape** — the only consumer of the mock's output is
 *   [TickerNarrativeParser]. We round-trip a real mock response through the real parser ; if the
 *   parser rejects it, this test catches the drift before integration tests do.
 * - **Deterministic per symbol** — same symbol must produce the same narrative across runs. Without
 *   this, CI flakes and visual regression on the dossier card becomes impossible.
 * - **Varied across symbols** — two different symbols must produce two different narratives
 *   (sentiment OR key points). A mock that returns the same string for every symbol would be
 *   useless for exercising the front's three sentiment chips.
 * - **Reserved `RATELIMIT` throws** — exercises the 503 path on the narrative SSE stream without
 *   requiring a real provider outage. Mirror of `MockMarketChartClient` / `MockAnalystClient` /
 *   `MockEarningsClient`.
 * - **`modelId` is a stable identifier** — pinned exact so the `prompt_score.model` column has a
 *   known sentinel value to filter by in the observability UI.
 */
class MockLlmClientTest {

  private val client = MockLlmClient()
  private val parser = TickerNarrativeParser(ObjectMapper())

  @Test
  fun `emits JSON that TickerNarrativeParser accepts without error`() {
    val raw =
      client.complete(systemPrompt = "ignored", userMessage = "Ticker: AAPL\n", maxTokens = 2048)

    // The real parser is the contract. We trust its assertions on shape (summary string, sentiment
    // enum, keyPoints array) — re-asserting them here would duplicate the parser tests.
    val parsed = parser.parse(raw)

    assertTrue(
      parsed.summary.startsWith("Mock narrative for AAPL"),
      "expected the synthetic summary to start with the Mock prefix, got: ${parsed.summary}",
    )
    assertNotNull(parsed.sentiment)
    assertTrue(parsed.keyPoints.isNotEmpty())
    assertTrue(parsed.keyPoints.all { it.contains("AAPL") })
  }

  @Test
  fun `same symbol yields the same narrative across two calls`() {
    val first = client.complete("", "Ticker: NVDA\n", 2048)
    val second = client.complete("", "Ticker: NVDA\n", 2048)

    assertEquals(first, second)
  }

  @Test
  fun `different symbols yield different narratives`() {
    // Two symbols whose hashes fall in distinct sentiment buckets are easy to find — pick any two
    // popular tickers. If this ever flakes, the SENTIMENT_BUCKETS distribution is the culprit ;
    // tweak the seed-rotation rather than weakening the assertion.
    val aapl = client.complete("", "Ticker: AAPL\n", 2048)
    val tsla = client.complete("", "Ticker: TSLA\n", 2048)

    assertTrue(aapl != tsla, "expected distinct narratives for AAPL vs TSLA, got identical output")
  }

  @Test
  fun `parsed sentiment is one of the three valid enum values regardless of symbol`() {
    // Sweeps a handful of common symbols to verify the bucket rotation never produces a value
    // outside the BULLISH/NEUTRAL/BEARISH triad. Defends against a copy-paste of the
    // SENTIMENT_BUCKETS list that accidentally introduces "MIXED" or a lowercase variant.
    val symbols = listOf("AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "TSLA", "META", "BRK.B")
    for (symbol in symbols) {
      val raw = client.complete("", "Ticker: $symbol\n", 2048)
      val parsed = parser.parse(raw)
      assertTrue(
        parsed.sentiment in setOf(Sentiment.BULLISH, Sentiment.NEUTRAL, Sentiment.BEARISH),
        "Unexpected sentiment for $symbol: ${parsed.sentiment}",
      )
    }
  }

  @Test
  fun `reserved RATELIMIT symbol throws UpstreamUnavailableException for the 503 path`() {
    val ex =
      assertThrows<UpstreamUnavailableException> {
        client.complete("", "Ticker: RATELIMIT\n", 2048)
      }
    assertTrue(ex.message?.contains("rate-limited") ?: false)
  }

  @Test
  fun `modelId is the stable mock sentinel`() {
    // The `prompt_score.model` column filter in the observability UI lets the user separate
    // "real LLM runs" from "mock smoke-test runs" — pinned exact so a rename here would force
    // updating the filter, which is a deliberate ergonomic trade.
    assertEquals("mock:narrative-v1", client.modelId())
  }

  @Test
  fun `falls back to UNKNOWN symbol when the user message has no Ticker line`() {
    // Defensive : if the prompt builder ever drops the leading "Ticker: …" header, the mock
    // shouldn't crash — it should produce a narrative against a synthetic symbol so the rest of
    // the pipeline keeps moving. The UNKNOWN seed is deterministic too.
    val raw = client.complete("", "no ticker line in here", 2048)
    val parsed = parser.parse(raw)

    assertTrue(parsed.summary.contains("UNKNOWN"))
  }
}
