package com.portfolioai.market.application

import com.portfolioai.market.domain.OhlcBar
import java.math.BigDecimal
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.random.Random
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Pure-function tests on [IndicatorCalculator]. The calculator has no Spring or IO, so we
 * instantiate it directly. Internal helpers are exercised one by one with small fixtures; the
 * public [IndicatorCalculator.compute] is covered separately on a few end-to-end cases.
 */
class IndicatorCalculatorTest {

  private val calc = IndicatorCalculator()

  // ---------------------------------------------------------------- compute()

  @Test
  fun `compute returns null on empty input`() {
    assertNull(calc.compute(emptyList()))
  }

  @Test
  fun `compute on a single bar fills price and as-of, leaves indicators null`() {
    val bar = bar("2025-01-15T00:00:00Z", close = 100.0, volume = 1000)
    val r = calc.compute(listOf(bar))!!
    assertEquals(bar.close, r.price)
    assertEquals(bar.timestamp, r.asOf)
    assertNull(r.rsi14)
    assertNull(r.ma50)
    assertNull(r.ma200)
    assertNull(r.perf1m)
    assertNull(r.drawdownFrom52wHigh)
  }

  @Test
  fun `compute resorts bars by timestamp before computing`() {
    // shuffled monotone-up series: same indicators as the sorted version
    val sorted = monotonicCloses(start = 100.0, step = 1.0, count = 60)
    val shuffled = sorted.shuffled(Random(42))
    val rSorted = calc.compute(sorted)!!
    val rShuffled = calc.compute(shuffled)!!
    assertEquals(rSorted.ma50, rShuffled.ma50)
    assertEquals(rSorted.rsi14, rShuffled.rsi14)
    assertEquals(rSorted.price, rShuffled.price)
  }

  @Test
  fun `compute on 60 monotone-up bars yields MA50 set, RSI close to 100, positive momentum`() {
    val bars = monotonicCloses(start = 100.0, step = 1.0, count = 60)
    val r = calc.compute(bars)!!
    assertNotNull(r.ma50)
    assertNull(r.ma200) // need 200, only have 60
    assertNotNull(r.rsi14)
    assertTrue(r.rsi14!! > BigDecimal("99.0"), "RSI should saturate near 100, was ${r.rsi14}")
    assertTrue(r.momentum30d!! > BigDecimal.ZERO)
    assertTrue(r.distanceToMa50Pct!! > BigDecimal.ZERO) // close > MA50 in an uptrend
  }

  @Test
  fun `compute on 60 monotone-down bars yields RSI close to 0`() {
    val bars = monotonicCloses(start = 200.0, step = -1.0, count = 60)
    val r = calc.compute(bars)!!
    assertTrue(r.rsi14!! < BigDecimal("1.0"), "RSI should saturate near 0, was ${r.rsi14}")
    assertTrue(r.momentum30d!! < BigDecimal.ZERO)
    // drawdown from the 252-bar window high — first bar is the highest
    assertTrue(r.drawdownFrom52wHigh!! < BigDecimal("-25"))
  }

  // ---------------------------------------------------------------------- sma

  @Test
  fun `sma returns null when series is shorter than period`() {
    assertNull(calc.sma(listOf(1.0, 2.0, 3.0), period = 5))
  }

  @Test
  fun `sma averages the last period values, ignoring older ones`() {
    val values = listOf(0.0, 0.0, 0.0, 10.0, 20.0, 30.0)
    assertEquals(20.0, calc.sma(values, period = 3)!!, 1e-9)
  }

  @Test
  fun `sma handles period 0 by returning null`() {
    assertNull(calc.sma(listOf(1.0, 2.0), period = 0))
  }

  // -------------------------------------------------------------- rsiWilder

  @Test
  fun `rsi returns null when series has fewer than period+1 closes`() {
    val tooShort = (1..14).map { it.toDouble() } // 14 values, 13 changes < period 14
    assertNull(calc.rsiWilder(tooShort, period = 14))
  }

  @Test
  fun `rsi on a flat series is 50 (no gains, no losses)`() {
    val flat = List(20) { 100.0 }
    assertEquals(50.0, calc.rsiWilder(flat, period = 14)!!, 1e-9)
  }

  @Test
  fun `rsi on monotone-up series saturates near 100`() {
    val up = (1..30).map { it.toDouble() }
    val r = calc.rsiWilder(up, period = 14)!!
    assertTrue(r > 99.0, "expected ≈100, got $r")
  }

  @Test
  fun `rsi on monotone-down series saturates near 0`() {
    val down = (1..30).map { (50 - it).toDouble() }
    val r = calc.rsiWilder(down, period = 14)!!
    assertTrue(r < 1.0, "expected ≈0, got $r")
  }

  // ---------------------------------------------------------- pctChangeBars

  @Test
  fun `pctChangeBars returns null when not enough history`() {
    assertNull(calc.pctChangeBars(listOf(100.0, 110.0), lookbackBars = 5))
  }

  @Test
  fun `pctChangeBars returns the percent change between latest and N ago`() {
    val closes = listOf(100.0, 105.0, 110.0, 115.0, 120.0) // +20% over 4 bars
    assertEquals(20.0, calc.pctChangeBars(closes, lookbackBars = 4)!!, 1e-9)
  }

  @Test
  fun `pctChangeBars treats a zero base as undefined`() {
    val closes = listOf(0.0, 10.0, 20.0)
    assertNull(calc.pctChangeBars(closes, lookbackBars = 2))
  }

  // -------------------------------------------------------- drawdownFromHigh

  @Test
  fun `drawdown is zero when current price equals the window high`() {
    val closes = listOf(80.0, 90.0, 100.0)
    assertEquals(
      0.0,
      calc.drawdownFromHigh(closes, currentPrice = 100.0, lookbackBars = 10)!!,
      1e-9,
    )
  }

  @Test
  fun `drawdown is negative when current price is below the window high`() {
    val closes = listOf(100.0, 110.0, 120.0)
    val dd = calc.drawdownFromHigh(closes, currentPrice = 90.0, lookbackBars = 10)!!
    assertEquals(-25.0, dd, 1e-9) // 90 vs high 120 = -25%
  }

  @Test
  fun `drawdown only considers the requested lookback window`() {
    // High 200 outside window, in-window high 110 → drawdown vs 100 = -9.09%
    val closes = listOf(200.0, 100.0, 105.0, 110.0)
    val dd = calc.drawdownFromHigh(closes, currentPrice = 100.0, lookbackBars = 3)!!
    assertEquals(-9.0909, dd, 1e-3)
  }

  // -------------------------------------------------------------- volumeRelative

  @Test
  fun `volumeRelative returns null when series is too short`() {
    assertNull(calc.volumeRelative(listOf(100L, 200L), period = 30))
  }

  @Test
  fun `volumeRelative compares latest to the average of the previous period`() {
    // 30 bars at volume 100, then a final spike at 300 → ratio 3.0
    val volumes = List(30) { 100L } + listOf(300L)
    assertEquals(3.0, calc.volumeRelative(volumes, period = 30)!!, 1e-9)
  }

  // ------------------------------------------------------- helpers (fixtures)

  private fun bar(iso: String, close: Double, volume: Long = 1_000): OhlcBar {
    val ts = Instant.parse(iso)
    val c = BigDecimal.valueOf(close)
    return OhlcBar(timestamp = ts, open = c, high = c, low = c, close = c, volume = volume)
  }

  /** Synthesises [count] daily bars starting at [start], stepping by [step] each day. */
  private fun monotonicCloses(start: Double, step: Double, count: Int): List<OhlcBar> {
    val t0 = Instant.parse("2025-01-01T00:00:00Z")
    return (0 until count).map { i ->
      val close = start + i * step
      val c = BigDecimal.valueOf(close)
      OhlcBar(
        timestamp = t0.plus(i.toLong(), ChronoUnit.DAYS),
        open = c,
        high = c,
        low = c,
        close = c,
        volume = 1_000L,
      )
    }
  }
}
