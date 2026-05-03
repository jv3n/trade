package com.portfolioai.market.infrastructure.market

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Tests on the pure conversion functions in `TwelveDataMappers.kt`. We deserialize a minimal
 * fixture mirroring Twelve Data's REST shape, then exercise the mappers to OHLC bars and quote. No
 * HTTP, no Spring.
 *
 * Each fixture below is a real failure mode we expect on Twelve Data :
 * - **`FIXTURE_HALTED_BAR`** — Twelve Data emits empty strings or `"NaN"` on illiquid / halted
 *   days. The mapper must skip such bars rather than feed `0` into the indicator math.
 * - **`FIXTURE_DESC_ORDER`** — default response order is most-recent-first ; the mapper must
 *   re-sort chronologically because the indicator calculator assumes oldest-first.
 * - **`FIXTURE_INTRADAY`** — `datetime` is `yyyy-MM-dd HH:mm:ss` for intraday intervals (`1h`,
 *   `5min`…). We must accept both shapes.
 *
 * Strategy : keep JSON inline so the fixture and assertion stay readable in one screen.
 */
class TwelveDataMappersTest {

  private val mapper = jacksonObjectMapper()

  @Test
  fun `toOhlcBars skips bars where any OHLCV field is empty or unparseable (halted day)`() {
    // Real shape observed : Twelve Data fills empty strings on halted-trading days.
    val response = parse(FIXTURE_HALTED_BAR)
    val bars = response.toOhlcBars()

    assertEquals(1, bars.size)
    assertEquals(BigDecimal("180.00"), bars[0].open)
  }

  @Test
  fun `toOhlcBars sorts bars chronologically when the API returns DESC order`() {
    // The `?order=ASC` parameter normally takes care of this, but we re-sort defensively in case
    // the upstream ignores the hint (observed on certain plan tiers).
    val response = parse(FIXTURE_DESC_ORDER)
    val bars = response.toOhlcBars()

    assertEquals(2, bars.size)
    assertTrue(bars[0].timestamp.isBefore(bars[1].timestamp))
  }

  @Test
  fun `toOhlcBars parses intraday datetime as yyyy-MM-dd HH-mm-ss`() {
    val response = parse(FIXTURE_INTRADAY)
    val bars = response.toOhlcBars()

    assertEquals(1, bars.size)
    // 2024-01-15T14:30:00 UTC.
    assertEquals(Instant.parse("2024-01-15T14:30:00Z"), bars[0].timestamp)
  }

  @Test
  fun `parseTimestamp returns null for null and blank`() {
    assertNull(parseTimestamp(null))
    assertNull(parseTimestamp(""))
    assertNull(parseTimestamp("   "))
  }

  @Test
  fun `parseTimestamp parses a daily date as midnight UTC`() {
    val expected = LocalDate.of(2024, 1, 15).atStartOfDay(ZoneOffset.UTC).toInstant()
    assertEquals(expected, parseTimestamp("2024-01-15"))
  }

  // ------------------------------------------------------------------ helpers

  private fun parse(json: String) = mapper.readValue(json, TwelveDataTimeSeriesResponse::class.java)

  // ----------------------------------------------------------------- fixtures

  /** Two values, second has empty strings (halted) — must be dropped. */
  private val FIXTURE_HALTED_BAR =
    """
    {
      "meta": {"symbol": "AAPL", "interval": "1day"},
      "values": [
        {
          "datetime": "2024-01-15",
          "open": "180.00", "high": "182.50", "low": "179.20", "close": "181.50",
          "volume": "1500000"
        },
        {
          "datetime": "2024-01-16",
          "open": "", "high": "", "low": "", "close": "",
          "volume": ""
        }
      ],
      "status": "ok"
    }
    """
      .trimIndent()

  /** Two values returned most-recent-first — mapper must reverse. */
  private val FIXTURE_DESC_ORDER =
    """
    {
      "meta": {"symbol": "AAPL", "interval": "1day"},
      "values": [
        {
          "datetime": "2024-01-16",
          "open": "181.00", "high": "183.00", "low": "180.50", "close": "182.00",
          "volume": "1800000"
        },
        {
          "datetime": "2024-01-15",
          "open": "180.00", "high": "182.50", "low": "179.20", "close": "181.50",
          "volume": "1500000"
        }
      ],
      "status": "ok"
    }
    """
      .trimIndent()

  /** Single intraday bar — `datetime` includes time. */
  private val FIXTURE_INTRADAY =
    """
    {
      "meta": {"symbol": "AAPL", "interval": "1h"},
      "values": [
        {
          "datetime": "2024-01-15 14:30:00",
          "open": "180.00", "high": "180.50", "low": "179.80", "close": "180.20",
          "volume": "120000"
        }
      ],
      "status": "ok"
    }
    """
      .trimIndent()
}
