package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Tests on the pure conversion functions in `YahooMappers.kt`. We deserialize a minimal fixture
 * mirroring Yahoo's `chart` payload, then exercise the mappers to OHLC bars and quote. No HTTP, no
 * Spring.
 *
 * Each fixture below is a real failure mode we've observed on Yahoo's undocumented endpoint :
 * - **`FIXTURE_TWO_BARS`** — happy path. Two bars with full OHLCV + complete meta.
 * - **`FIXTURE_HALTED_BAR`** — one bar with `null` close and volume. Yahoo emits these on halted
 *   trading days ; our mapper must skip them rather than feed `null` into the indicator math.
 * - **`FIXTURE_NO_TIMESTAMP`** — chart endpoint occasionally answers with no timestamp array on
 *   delisted symbols. We return an empty bars list rather than crash.
 * - **`FIXTURE_NO_LIVE_QUOTE`** — `regularMarketPrice` is missing on after-hours / delisted
 *   tickers. We fall back to the last bar close so the dossier can still display *something*.
 * - **`FIXTURE_SHORT_NAME`** — `longName` missing (common on ETFs and obscure tickers). `shortName`
 *   is the next-best label.
 *
 * Strategy : keep the JSON inline so the fixture and the assertion live next to each other. A
 * separate fixtures file would force the reader to context-switch on every test.
 */
class YahooMappersTest {

  private val mapper = jacksonObjectMapper()

  @Test
  fun `toOhlcBars parses every bar where OHLCV is fully present`() {
    val result = parse(FIXTURE_TWO_BARS).chart.result!!.first()
    val bars = result.toOhlcBars()

    assertEquals(2, bars.size)
    assertEquals(Instant.ofEpochSecond(1_700_000_000), bars[0].timestamp)
    assertEquals(BigDecimal("100.0"), bars[0].open)
    assertEquals(BigDecimal("102.5"), bars[0].close)
    assertEquals(1_500_000L, bars[0].volume)
  }

  @Test
  fun `toOhlcBars skips bars where any OHLCV field is null (halted day)`() {
    // Second bar has close=null and volume=null — must be dropped.
    val result = parse(FIXTURE_HALTED_BAR).chart.result!!.first()
    val bars = result.toOhlcBars()

    assertEquals(1, bars.size)
    assertEquals(Instant.ofEpochSecond(1_700_000_000), bars[0].timestamp)
  }

  @Test
  fun `toOhlcBars returns empty list when timestamp array is missing`() {
    val result = parse(FIXTURE_NO_TIMESTAMP).chart.result!!.first()
    assertTrue(result.toOhlcBars().isEmpty())
  }

  @Test
  fun `toTickerQuote pulls all fields from meta when available`() {
    val result = parse(FIXTURE_TWO_BARS).chart.result!!.first()
    val q = result.toTickerQuote()

    assertEquals("AAPL", q.symbol)
    assertEquals("Apple Inc.", q.name)
    assertEquals("USD", q.currency)
    assertEquals("NasdaqGS", q.exchange)
    assertEquals(BigDecimal("103.0"), q.price)
    assertEquals(BigDecimal("110.0"), q.fiftyTwoWeekHigh)
    assertEquals(BigDecimal("85.0"), q.fiftyTwoWeekLow)
    assertEquals(Instant.ofEpochSecond(1_700_086_400), q.asOf)
  }

  @Test
  fun `toTickerQuote falls back to last bar close when regularMarketPrice is missing`() {
    // Live quote missing, but historical bars are there → use the latest close.
    val result = parse(FIXTURE_NO_LIVE_QUOTE).chart.result!!.first()
    val q = result.toTickerQuote()

    assertEquals(BigDecimal("102.5"), q.price)
    assertEquals(Instant.ofEpochSecond(1_700_086_400), q.asOf)
  }

  @Test
  fun `toTickerQuote uses shortName when longName is missing`() {
    val result = parse(FIXTURE_SHORT_NAME).chart.result!!.first()
    assertEquals("AAPL", result.toTickerQuote().name)
  }

  // ------------------------------------------------------------------ helpers

  private fun parse(json: String) = mapper.readValue(json, YahooChartResponse::class.java)

  // ----------------------------------------------------------------- fixtures

  /** Two complete bars + full meta. Standard happy-path. */
  private val FIXTURE_TWO_BARS =
    """
    {
      "chart": {
        "error": null,
        "result": [
          {
            "meta": {
              "symbol": "AAPL",
              "longName": "Apple Inc.",
              "currency": "USD",
              "fullExchangeName": "NasdaqGS",
              "regularMarketPrice": 103.0,
              "regularMarketTime": 1700086400,
              "fiftyTwoWeekHigh": 110.0,
              "fiftyTwoWeekLow": 85.0
            },
            "timestamp": [1700000000, 1700086400],
            "indicators": {
              "quote": [
                {
                  "open":   [100.0, 102.5],
                  "high":   [103.0, 104.0],
                  "low":    [ 99.0, 101.0],
                  "close":  [102.5, 103.0],
                  "volume": [1500000, 1800000]
                }
              ]
            }
          }
        ]
      }
    }
    """
      .trimIndent()

  /** First bar OK ; second bar has nulls (halted). The mapper must skip the second. */
  private val FIXTURE_HALTED_BAR =
    """
    {
      "chart": {
        "error": null,
        "result": [
          {
            "meta": {
              "symbol": "AAPL",
              "regularMarketPrice": 102.5,
              "regularMarketTime": 1700086400
            },
            "timestamp": [1700000000, 1700086400],
            "indicators": {
              "quote": [
                {
                  "open":   [100.0, 102.5],
                  "high":   [103.0, 104.0],
                  "low":    [ 99.0, 101.0],
                  "close":  [102.5, null],
                  "volume": [1500000, null]
                }
              ]
            }
          }
        ]
      }
    }
    """
      .trimIndent()

  /** No timestamp array → no bars. */
  private val FIXTURE_NO_TIMESTAMP =
    """
    {
      "chart": {
        "error": null,
        "result": [
          {
            "meta": { "symbol": "AAPL" },
            "indicators": { "quote": [{}] }
          }
        ]
      }
    }
    """
      .trimIndent()

  /** No live quote in meta → fallback to last bar close. */
  private val FIXTURE_NO_LIVE_QUOTE =
    """
    {
      "chart": {
        "error": null,
        "result": [
          {
            "meta": { "symbol": "AAPL", "currency": "USD" },
            "timestamp": [1700000000, 1700086400],
            "indicators": {
              "quote": [
                {
                  "open":   [100.0, 102.5],
                  "high":   [103.0, 104.0],
                  "low":    [ 99.0, 101.0],
                  "close":  [102.5, 102.5],
                  "volume": [1500000, 1800000]
                }
              ]
            }
          }
        ]
      }
    }
    """
      .trimIndent()

  /** longName missing — shortName must be used. */
  private val FIXTURE_SHORT_NAME =
    """
    {
      "chart": {
        "error": null,
        "result": [
          {
            "meta": {
              "symbol": "AAPL",
              "shortName": "AAPL",
              "regularMarketPrice": 100.0,
              "regularMarketTime": 1700000000
            },
            "indicators": { "quote": [{}] }
          }
        ]
      }
    }
    """
      .trimIndent()
}
