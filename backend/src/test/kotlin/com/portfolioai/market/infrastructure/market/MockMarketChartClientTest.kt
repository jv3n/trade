package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.application.IndicatorCalculator
import com.portfolioai.market.domain.MarketUnavailableException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/**
 * Tests on the synthetic data generator. Two things to assert :
 * 1. **Output shape is realistic enough** that [IndicatorCalculator] computes every indicator (i.e.
 *    enough bars, all OHLCV non-null, prices > 0). The mock exists to unblock dev when the network
 *    providers rate-limit us — but only if it produces data the rest of the pipeline can chew on.
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
    val chart = client.fetchChart("AAPL", "1y", "1d")

    assertEquals(260, chart.bars.size)
    chart.bars.forEach {
      assertTrue(it.open.toDouble() > 0)
      assertTrue(it.close.toDouble() > 0)
      assertTrue(it.high >= maxOf(it.open, it.close))
      assertTrue(it.low <= minOf(it.open, it.close))
      assertTrue(it.volume > 0)
    }

    // Every nullable indicator on IndicatorCalculator should resolve with 260 bars.
    val indicators = calculator.compute(chart.bars)!!
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

    assertEquals(a.bars.map { it.timestamp }, b.bars.map { it.timestamp })
    assertEquals(a.bars.map { it.close }, b.bars.map { it.close })
    assertEquals(a.quote.price, b.quote.price)
  }

  @Test
  fun `different symbols yield different series`() {
    val a = client.fetchChart("AAPL", "1y", "1d")
    val b = client.fetchChart("ZZZZ", "1y", "1d")
    assertNotEquals(a.quote.price, b.quote.price)
  }

  @Test
  fun `quote exposes 52w high low matching the close series`() {
    val chart = client.fetchChart("NVDA", "1y", "1d")
    val closes = chart.bars.map { it.close }
    assertEquals(closes.max(), chart.quote.fiftyTwoWeekHigh)
    assertEquals(closes.min(), chart.quote.fiftyTwoWeekLow)
    assertEquals(closes.last(), chart.quote.price)
  }

  @Test
  fun `reserved UNKNOWN throws NoSuchElementException`() {
    assertThrows<NoSuchElementException> { client.fetchChart("UNKNOWN", "1y", "1d") }
  }

  @Test
  fun `reserved RATELIMIT throws MarketUnavailableException`() {
    assertThrows<MarketUnavailableException> { client.fetchChart("RATELIMIT", "1y", "1d") }
  }

  @Test
  fun `intraday range produces a denser short series than 1y daily`() {
    // The chart toggle on the dossier asks for 1d/5min when the user clicks "1D" — without this
    // honoring of the (range, interval) combo the mock would happily return 260 daily bars and
    // every timeframe would look identical on the chart. Symptom would be silent : the user
    // clicks 1D, sees the 1Y curve, doesn't realise the toggle is broken.
    val intraday = client.fetchChart("AAPL", "1d", "5m")
    val daily = client.fetchChart("AAPL", "1y", "1d")

    assertEquals(80, intraday.bars.size)
    assertEquals(260, daily.bars.size)
    // Intraday bars are 5 minutes apart, not 1 day.
    val gapMinutes =
      java.time.Duration.between(intraday.bars[0].timestamp, intraday.bars[1].timestamp).toMinutes()
    assertEquals(5L, gapMinutes)
  }

  @Test
  fun `weekly range produces 7-day-spaced bars`() {
    // The "5Y" toggle uses 1wk bars. We don't want it to fall back to daily silently — if it did,
    // a 5Y view at daily granularity would mean 1300 bars for a chart that's supposed to be
    // a coarse weekly overview.
    val weekly = client.fetchChart("AAPL", "5y", "1wk")
    val gapDays =
      java.time.Duration.between(weekly.bars[0].timestamp, weekly.bars[1].timestamp).toDays()
    assertEquals(7L, gapDays)
  }

  @Test
  fun `timeframes for the same symbol produce different series`() {
    // Seed includes range+interval — without this, switching the toggle would replay the exact
    // same random walk at a different resolution, which is unnatural for a real provider and
    // makes the toggle less useful for spotting visual differences during dev.
    val daily = client.fetchChart("AAPL", "1y", "1d").bars.map { it.close }
    val weekly = client.fetchChart("AAPL", "5y", "1wk").bars.map { it.close }
    assertNotEquals(daily.first(), weekly.first())
  }
}
