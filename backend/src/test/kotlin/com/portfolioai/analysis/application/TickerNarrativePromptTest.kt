package com.portfolioai.analysis.application

import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Prompt-builder unit tests. The user message is what the LLM actually reads — its shape is the
 * spec, and the tests below pin that spec down.
 *
 * Two non-obvious behaviours we explicitly verify :
 * - **Null indicators are skipped silently**, not rendered as "RSI(14): null". The system prompt
 *   says "do not mention indicators absent from the input", but the LLM interprets a `null` line as
 *   "this *was* sent, please discuss it" and hallucinates a value. The only safe move is to omit
 *   the line entirely.
 * - **Optional metadata (`name`, `currency`) is omitted when null** for the same reason : an empty
 *   `Name:` line invites the model to invent a name. Tickers like `BRK-B` may have `null` name in
 *   our domain, and we don't want a fabricated "Berkshire Hathaway" appearing in the narrative.
 */
class TickerNarrativePromptTest {

  /** Apple-shaped happy default. Tests override the fields that matter for the scenario. */
  private fun quote(
    symbol: String = "AAPL",
    name: String? = "Apple Inc.",
    currency: String? = "USD",
  ) =
    TickerQuote(
      symbol = symbol,
      name = name,
      currency = currency,
      exchange = "NASDAQ",
      price = BigDecimal("180.00"),
      fiftyTwoWeekHigh = BigDecimal("200.00"),
      fiftyTwoWeekLow = BigDecimal("140.00"),
      asOf = Instant.parse("2026-05-02T13:00:00Z"),
    )

  /** Realistic bullish-leaning indicators (price above MA200, RSI healthy, drawdown moderate). */
  private fun indicators(
    rsi: BigDecimal? = BigDecimal("62.5"),
    ma200: BigDecimal? = BigDecimal("170.00"),
  ) =
    Indicators(
      asOf = Instant.parse("2026-05-02T13:00:00Z"),
      price = BigDecimal("180.00"),
      rsi14 = rsi,
      ma50 = BigDecimal("178.00"),
      ma200 = ma200,
      momentum30d = BigDecimal("3.50"),
      momentum90d = BigDecimal("8.20"),
      perf1m = BigDecimal("2.40"),
      perf3m = BigDecimal("9.10"),
      perf1y = BigDecimal("18.30"),
      drawdownFrom52wHigh = BigDecimal("-10.00"),
      volumeRelative30d = BigDecimal("1.20"),
      distanceToMa50Pct = BigDecimal("1.10"),
      distanceToMa200Pct = BigDecimal("5.90"),
    )

  @Test
  fun `includes ticker, price, and every present indicator`() {
    val msg = buildNarrativeUserMessage(quote(), indicators())

    assertTrue(msg.contains("Ticker: AAPL"))
    assertTrue(msg.contains("Apple Inc."))
    assertTrue(msg.contains("Current price: 180"))
    assertTrue(msg.contains("RSI(14): 62.5"))
    assertTrue(msg.contains("MA200: 170"))
    assertTrue(msg.contains("Momentum 30d: 3.5%"))
    assertTrue(msg.contains("Drawdown from 52w high: -10%"))
  }

  @Test
  fun `omits null indicators silently`() {
    // RSI and MA200 nulled out (e.g. series too short to compute them yet).
    val msg = buildNarrativeUserMessage(quote(), indicators(rsi = null, ma200 = null))
    val lines = msg.lines()

    // No mention of RSI or MA200 — not even a "RSI(14): null" line. If we left such a line in,
    // the LLM would invariably treat it as "discuss this" and hallucinate a value.
    assertFalse(lines.any { it.startsWith("- RSI(14):") })
    assertFalse(lines.any { it.startsWith("- MA200:") })

    // Other indicators still rendered — the omission is per-field, not all-or-nothing.
    assertTrue(lines.any { it.startsWith("- MA50:") })
  }

  @Test
  fun `omits null name and currency`() {
    // Tickers like BRK-B occasionally come back from the chart endpoint with `name = null`.
    // We must not emit `Name:` (with empty value) — the LLM happily invents one.
    val msg = buildNarrativeUserMessage(quote(name = null, currency = null), indicators())

    assertFalse(msg.contains("Name:"))
    assertFalse(msg.contains("Currency:"))
    // The ticker symbol itself is non-optional and always renders.
    assertTrue(msg.contains("Ticker: AAPL"))
  }
}
