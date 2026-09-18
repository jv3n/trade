package com.portfolioai.stats.domain

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Pure percentage metrics derived from a stat row's price levels, all relative to the open.
 *
 * Encoding matches the rest of the stats model : **value ×100**, 2 decimals, `HALF_UP` rounding (so
 * `5.95` means 5.95 %, consistent with `gapUpPercent`). A negative result means the level sat below
 * the open — favourable for a short.
 *
 * Computed at insert time by [com.portfolioai.stats.application.StatEntryService] and persisted
 * into the `*_percent` columns ; never read from the import CSV.
 */
object StatMetrics {
  private const val SCALE = 2
  private val HUNDRED = BigDecimal("100")

  /** `(high - open) / open * 100`. */
  fun pushPercent(open: BigDecimal, high: BigDecimal): BigDecimal = relativeToOpen(open, high)

  /** `(lod - open) / open * 100`. */
  fun lodPercent(open: BigDecimal, lod: BigDecimal): BigDecimal = relativeToOpen(open, lod)

  /** `(eod - open) / open * 100`. */
  fun eodPercent(open: BigDecimal, eod: BigDecimal): BigDecimal = relativeToOpen(open, eod)

  private fun relativeToOpen(open: BigDecimal, value: BigDecimal): BigDecimal =
    value.subtract(open).multiply(HUNDRED).divide(open, SCALE, RoundingMode.HALF_UP)
}
