package com.portfolioai.stats.domain

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Percentages derived from a stat's prices — **never stored**. Used server-side for the listing
 * KPIs ; the front recomputes the same formulas for the table and the live completion preview
 * (`features/stats/stats.math.ts`).
 *
 * Encoding : whole-number percentage, 2 decimals, `HALF_UP` (`52.83` = +52.83 %). A session
 * percentage below zero means the level sat under the open — favourable for a short.
 */
object StatMetrics {
  private const val SCALE = 2
  private val HUNDRED = BigDecimal("100")

  /** Gap % = (PM open − previous close) / previous close. */
  fun gapPercent(previousClose: BigDecimal, pmOpen: BigDecimal): BigDecimal? =
    change(previousClose, pmOpen)

  /** Premarket push % = (PM high − PM open) / PM open. */
  fun pmPushPercent(pmOpen: BigDecimal, pmHigh: BigDecimal): BigDecimal? = change(pmOpen, pmHigh)

  /** Any session level against the session open — push at open, HOD, LOD, EOD. */
  fun percentVsOpen(open: BigDecimal?, level: BigDecimal?): BigDecimal? {
    if (open == null || level == null) return null
    return change(open, level)
  }

  /** A move between two prices — the legs of a double top (#428). Null when either is missing. */
  fun percentChange(from: BigDecimal?, to: BigDecimal?): BigDecimal? {
    if (from == null || to == null) return null
    return change(from, to)
  }

  /**
   * The [fraction] quantile of [values] (0.5 = median, 0.75 = 3rd quartile), interpolated between
   * the two nearest ranks — the spreadsheet `PERCENTILE.INC`, so the figures match a manual check.
   * Null when [values] is empty.
   */
  fun quantile(values: List<BigDecimal>, fraction: BigDecimal): BigDecimal? {
    if (values.isEmpty()) return null
    val sorted = values.sorted()
    val position = fraction.multiply(BigDecimal(sorted.size - 1))
    val lower = position.toInt()
    val upper = minOf(lower + 1, sorted.size - 1)
    val weight = position.subtract(BigDecimal(lower))
    return sorted[lower]
      .add(sorted[upper].subtract(sorted[lower]).multiply(weight))
      .setScale(SCALE, RoundingMode.HALF_UP)
  }

  private fun change(base: BigDecimal, value: BigDecimal): BigDecimal? {
    if (base.signum() <= 0) return null
    return value.subtract(base).multiply(HUNDRED).divide(base, SCALE, RoundingMode.HALF_UP)
  }
}
