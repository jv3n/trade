package com.portfolioai.market.application

import com.portfolioai.market.domain.Indicators
import com.portfolioai.market.domain.OhlcBar
import java.math.BigDecimal
import java.math.RoundingMode
import org.springframework.stereotype.Component

/**
 * Pure technical-indicator computation. Given a chronologically-ordered series of OHLC bars (oldest
 * first), returns every indicator the series is long enough to support — null otherwise. The LLM
 * never computes these ; it only consumes them.
 *
 * The class is annotated `@Component` so Spring can inject it, but the *logic* has no Spring
 * runtime dependency (no `@Transactional`, no Spring lifecycle, no IO). Tests instantiate it
 * directly with `IndicatorCalculator()`.
 *
 * Conventions:
 * - Lookbacks are expressed in **bars**, not calendar days. "1 month" ≈ 21 trading days, "3 months"
 *   ≈ 63, "1 year" ≈ 252.
 * - Percentages are values not fractions: 5% = 5, not 0.05.
 * - Output [BigDecimal]s are scaled to 4 decimals (`HALF_UP`).
 */
@Component
class IndicatorCalculator {

  fun compute(bars: List<OhlcBar>): Indicators? {
    if (bars.isEmpty()) return null
    val sorted = bars.sortedBy { it.timestamp }
    val closes = sorted.map { it.close.toDouble() }
    val volumes = sorted.map { it.volume }
    val latest = sorted.last()
    val latestClose = closes.last()

    val ma50 = sma(closes, 50)
    val ma200 = sma(closes, 200)

    return Indicators(
      asOf = latest.timestamp,
      price = latest.close,
      rsi14 = rsiWilder(closes, 14)?.toScaledBigDecimal(),
      ma50 = ma50?.toScaledBigDecimal(),
      ma200 = ma200?.toScaledBigDecimal(),
      momentum30d = pctChangeBars(closes, 30)?.toScaledBigDecimal(),
      momentum90d = pctChangeBars(closes, 90)?.toScaledBigDecimal(),
      perf1m = pctChangeBars(closes, 21)?.toScaledBigDecimal(),
      perf3m = pctChangeBars(closes, 63)?.toScaledBigDecimal(),
      perf1y = pctChangeBars(closes, 252)?.toScaledBigDecimal(),
      drawdownFrom52wHigh = drawdownFromHigh(closes, latestClose, 252)?.toScaledBigDecimal(),
      volumeRelative30d = volumeRelative(volumes, 30)?.toScaledBigDecimal(),
      distanceToMa50Pct = ma50?.let { pctChange(it, latestClose).toScaledBigDecimal() },
      distanceToMa200Pct = ma200?.let { pctChange(it, latestClose).toScaledBigDecimal() },
    )
  }

  // ----------------------------------------------------------------------
  // Pure helpers — `internal` so tests in the same module can call them
  // directly with small fixtures, instead of going through `compute()` and
  // assembling synthetic OHLC bars for every case.
  // ----------------------------------------------------------------------

  /** Simple moving average over the last [period] values. Null if the series is too short. */
  internal fun sma(values: List<Double>, period: Int): Double? {
    if (period <= 0) return null
    if (values.size < period) return null
    return values.takeLast(period).average()
  }

  /**
   * Relative Strength Index with Wilder smoothing. Needs at least [period] + 1 closes (one extra to
   * compute the first change). Conventions for degenerate cases:
   * - All gains, no losses → 100
   * - No gains, no losses (flat series) → 50
   */
  internal fun rsiWilder(closes: List<Double>, period: Int = 14): Double? {
    if (period <= 0) return null
    if (closes.size <= period) return null

    val changes = closes.zipWithNext { a, b -> b - a }
    val gains = changes.map { if (it > 0) it else 0.0 }
    val losses = changes.map { if (it < 0) -it else 0.0 }

    var avgGain = gains.take(period).average()
    var avgLoss = losses.take(period).average()

    for (i in period until changes.size) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    }

    if (avgLoss == 0.0) return if (avgGain == 0.0) 50.0 else 100.0
    val rs = avgGain / avgLoss
    return 100.0 - (100.0 / (1.0 + rs))
  }

  /** Percent change between [from] and [to]. Caller guarantees `from != 0`. */
  internal fun pctChange(from: Double, to: Double): Double {
    require(from != 0.0) { "pctChange requires a non-zero base" }
    return (to - from) / from * 100.0
  }

  /** Percent change between the close [lookbackBars] ago and the latest close. */
  internal fun pctChangeBars(closes: List<Double>, lookbackBars: Int): Double? {
    if (lookbackBars <= 0) return null
    if (closes.size <= lookbackBars) return null
    val from = closes[closes.size - 1 - lookbackBars]
    if (from == 0.0) return null
    return pctChange(from, closes.last())
  }

  /**
   * Drawdown of [currentPrice] from the maximum close observed over the last [lookbackBars].
   * Returned as a percent — typically negative or zero.
   *
   * Requires at least 2 closes in the series : with a single bar there's no "history" to compare
   * against (the high *is* the current price, so drawdown would always be 0 — true but
   * meaningless). We return null instead, matching the convention of every other indicator on
   * too-short series.
   */
  internal fun drawdownFromHigh(
    closes: List<Double>,
    currentPrice: Double,
    lookbackBars: Int,
  ): Double? {
    if (lookbackBars <= 0) return null
    if (closes.size < 2) return null
    val window = closes.takeLast(lookbackBars)
    if (window.isEmpty()) return null
    val high = window.max()
    if (high == 0.0) return null
    return (currentPrice - high) / high * 100.0
  }

  /**
   * Latest volume divided by the average volume of the previous [period] bars (excluding the latest
   * bar itself). 1.5 = 50% above average.
   */
  internal fun volumeRelative(volumes: List<Long>, period: Int = 30): Double? {
    if (period <= 0) return null
    if (volumes.size < period + 1) return null
    val recent = volumes.last().toDouble()
    val avg = volumes.dropLast(1).takeLast(period).map { it.toDouble() }.average()
    if (avg == 0.0) return null
    return recent / avg
  }

  // BigDecimal.valueOf(double) instead of BigDecimal(double) to avoid the well-known
  // precision quirks of the Double constructor (BigDecimal(0.1) → 0.1000000000…).
  private fun Double.toScaledBigDecimal(): BigDecimal =
    BigDecimal.valueOf(this).setScale(OUTPUT_SCALE, RoundingMode.HALF_UP)

  companion object {
    private const val OUTPUT_SCALE = 4
  }
}
