package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.application.IndicatorCalculator
import com.portfolioai.market.domain.MarketUnavailableException
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on the synthetic data generator. Two things to assert :
 * 1. **Output shape is realistic enough** that [IndicatorCalculator] computes every indicator (i.e.
 *    enough bars, all OHLCV non-null, prices > 0). The mock exists to unblock dev when Yahoo
 *    rate-limits us — but only if it produces data the rest of the pipeline can chew on.
 * 2. **Reserved symbols `UNKNOWN` / `RATELIMIT`** still throw the documented exceptions. The
 *    dossier UI relies on them to exercise the 404 and 503 error paths during manual QA — if we
 *    ever silently succeed on `UNKNOWN`, the front team's "broken state" page coverage breaks
 *    quietly.
 *
 * Determinism (**same symbol → same series across calls**) is also asserted because the dossier
 * visual stability across reloads depends on it. A flaky mock that re-rolled data on every fetch
 * would defeat the purpose — the user would see different chart shapes for the same ticker on each
 * navigation.
 */
class MockMarketChartClientTest {

  private val client = MockMarketChartClient()
  private val calculator = IndicatorCalculator()

  @Test
  fun `produces a 1y daily series usable by the indicator calculator`() {
    val result = client.fetchChart("AAPL", "1y", "1d")

    val bars = result.toOhlcBars()
    assertEquals(260, bars.size)
    bars.forEach {
      assertTrue(it.open.toDouble() > 0)
      assertTrue(it.close.toDouble() > 0)
      assertTrue(it.high >= maxOf(it.open, it.close))
      assertTrue(it.low <= minOf(it.open, it.close))
      assertTrue(it.volume > 0)
    }

    // Every nullable indicator on IndicatorCalculator should resolve with 260 bars.
    val indicators = calculator.compute(bars)!!
    assertNotNull(indicators.rsi14)
    assertNotNull(indicators.ma50)
    assertNotNull(indicators.ma200)
    assertNotNull(indicators.momentum90d)
    assertNotNull(indicators.perf1y)
    assertNotNull(indicators.drawdownFrom52wHigh)
    assertNotNull(indicators.volumeRelative30d)
  }

  @Test
  fun `same symbol yields the same series across calls`() {
    val a = client.fetchChart("MSFT", "1y", "1d")
    val b = client.fetchChart("MSFT", "1y", "1d")

    assertEquals(a.timestamp, b.timestamp)
    assertEquals(a.indicators?.quote?.first()?.close, b.indicators?.quote?.first()?.close)
    assertEquals(a.meta.regularMarketPrice, b.meta.regularMarketPrice)
  }

  @Test
  fun `different symbols yield different series`() {
    val a = client.fetchChart("AAPL", "1y", "1d")
    val b = client.fetchChart("ZZZZ", "1y", "1d")
    assertNotEquals(a.meta.regularMarketPrice, b.meta.regularMarketPrice)
  }

  @Test
  fun `meta exposes 52w high low matching the close series`() {
    val result = client.fetchChart("NVDA", "1y", "1d")
    val closes = result.indicators!!.quote!!.first().close!!.filterNotNull()
    assertEquals(closes.max(), result.meta.fiftyTwoWeekHigh)
    assertEquals(closes.min(), result.meta.fiftyTwoWeekLow)
    assertEquals(closes.last(), result.meta.regularMarketPrice)
  }

  @Test
  fun `reserved UNKNOWN throws NoSuchElementException`() {
    assertThrows<NoSuchElementException> { client.fetchChart("UNKNOWN", "1y", "1d") }
  }

  @Test
  fun `reserved RATELIMIT throws MarketUnavailableException`() {
    assertThrows<MarketUnavailableException> { client.fetchChart("RATELIMIT", "1y", "1d") }
  }
}
