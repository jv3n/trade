package com.portfolioai.analysis.infrastructure.llm

import com.portfolioai.analysis.domain.LlmClient
import com.portfolioai.shared.UpstreamUnavailableException
import kotlin.random.Random
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * Synthetic LLM narrative generator — produces a deterministic, parser-compatible JSON response per
 * symbol so the full ticker narrative pipeline runs end-to-end without an API key.
 *
 * Activation : `llm.provider: mock`. Routed by [RoutingLlmClient] alongside [ClaudeClient] and
 * [OllamaClient], all three always wired (no `@ConditionalOnProperty`).
 *
 * **Why this exists** — closes the parity gap with `MockNewsClient`, `MockMarketChartClient`,
 * `MockAnalystClient`, `MockEarningsClient`. Before #4 partial (livré 2026-05-15), a fresh clone
 * with no `ANTHROPIC_API_KEY` and `llm.provider: ollama` defaulted to needing Ollama running ; if
 * it wasn't, the narrative card hung. With `llm.provider: mock` as a third option, the **entire
 * app** runs deterministically without any API key or local LLM — onboarding testers and CI smoke
 * tests stop hitting "LLM unreachable" walls.
 *
 * Generator properties :
 * - **Deterministic per symbol** — same symbol always yields the same narrative (seed = symbol
 *   hash). Reload the dossier and the card looks identical.
 * - **Realistic-shaped JSON** — emits exactly the format expected by [TickerNarrativeParser] : `{
 *   "summary": ..., "sentiment": "BULLISH|NEUTRAL|BEARISH", "keyPoints": [...] }`. Distribution ~35
 *   % BULLISH / ~40 % NEUTRAL / ~25 % BEARISH so the front's three sentiment chips all show up
 *   regularly during dev.
 * - **Obviously synthetic content** — every narrative starts with "Mock narrative for {SYMBOL}" so
 *   nobody confuses the output for a real LLM run. The downstream `prompt_score` row records `model
 *   = mock:narrative-v1` for the same reason.
 *
 * Reserved symbols (mirror of the data-provider mocks) :
 * - `RATELIMIT` → throws [UpstreamUnavailableException], exercises the 503 path on the narrative
 *   SSE stream without requiring a real provider outage.
 *
 * **No real latency simulation** — the mock returns in milliseconds. The frontend's "Calling LLM
 * (38 s)…" timer is exercised against `claude` or `ollama` ; the mock is the path for testing
 * everything *except* the slow-call UX.
 */
@Component
class MockLlmClient : LlmClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun complete(systemPrompt: String, userMessage: String, maxTokens: Int): String {
    val symbol = extractSymbol(userMessage)
    log.info("Mock LLM narrative symbol={}", symbol)

    if (symbol == RESERVED_RATELIMIT) {
      throw UpstreamUnavailableException("rate-limited (mock)")
    }

    val rng = Random(symbol.hashCode().toLong())
    val sentiment = SENTIMENT_BUCKETS[rng.nextInt(SENTIMENT_BUCKETS.size)]
    val keyPoints =
      KEY_POINT_TEMPLATES.shuffled(rng).take(KEY_POINTS_PER_NARRATIVE).map {
        it.replace("{symbol}", symbol)
      }

    val summary =
      "Mock narrative for $symbol — synthetic ${sentiment.lowercase()} outlook for local dev " +
        "and CI smoke tests. No real model was called."

    // Hand-rolled JSON so we don't drag Jackson into a Mock that ought to be cheap. The shape is
    // pinned by `TickerNarrativeParser.parse()` ; the integration test boots both ends and asserts
    // the parser accepts what this method emits.
    return buildString {
      append("{\n")
      append("  \"summary\": ").append(jsonString(summary)).append(",\n")
      append("  \"sentiment\": ").append(jsonString(sentiment)).append(",\n")
      append("  \"keyPoints\": [\n")
      keyPoints.forEachIndexed { i, kp ->
        append("    ").append(jsonString(kp))
        if (i < keyPoints.lastIndex) append(",")
        append("\n")
      }
      append("  ]\n")
      append("}\n")
    }
  }

  override fun modelId(): String = "mock:narrative-v1"

  /**
   * The prompt builder prefixes the user message with "Ticker: {symbol}\n" (see
   * `TickerNarrativePrompt.buildNarrativeUserMessage`). We grep for that line rather than parsing
   * the whole prompt — robust to additions of new indicator lines and cheap to compute.
   */
  private fun extractSymbol(userMessage: String): String {
    val match = TICKER_LINE_REGEX.find(userMessage)
    return match?.groupValues?.get(1)?.uppercase() ?: "UNKNOWN"
  }

  /**
   * Minimal JSON string escaping — `"` and `\` only. The strings we emit are static templates with
   * no control characters or unicode quirks, so we don't need a full Jackson round-trip.
   */
  private fun jsonString(s: String): String =
    '"' + s.replace("\\", "\\\\").replace("\"", "\\\"") + '"'

  companion object {
    /** Symbol that forces the 503 path so the front's degraded-narrative UX can be tested. */
    private const val RESERVED_RATELIMIT = "RATELIMIT"

    private const val KEY_POINTS_PER_NARRATIVE = 3

    /**
     * Sentiment distribution skewed towards NEUTRAL+BULLISH to mirror what real LLMs typically
     * produce on a balanced market chart. Cheaper than computing a histogram per symbol — the
     * shuffle on `hashCode` rotates them deterministically across the symbol space.
     */
    private val SENTIMENT_BUCKETS =
      listOf(
        "BULLISH",
        "BULLISH",
        "BULLISH",
        "NEUTRAL",
        "NEUTRAL",
        "NEUTRAL",
        "NEUTRAL",
        "BEARISH",
        "BEARISH",
      )

    private val KEY_POINT_TEMPLATES =
      listOf(
        "Price action on {symbol} is consistent with the recent technical setup",
        "RSI on {symbol} sits in the neutral band, no overbought or oversold signal",
        "Moving averages on {symbol} show no decisive crossover this week",
        "Volume on {symbol} is in line with the 30-day average",
        "Momentum on {symbol} is mixed across the 30 and 90 day windows",
        "Drawdown from the 52-week high on {symbol} remains manageable",
        "{symbol} is trading near the middle of its 52-week range",
        "No standout indicator on {symbol} would override the current narrative",
      )

    private val TICKER_LINE_REGEX = Regex("""^Ticker:\s*([A-Za-z0-9.\-]+)""", RegexOption.MULTILINE)
  }
}
