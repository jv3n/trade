package com.portfolioai.market.domain

import java.math.BigDecimal
import java.time.Instant

/**
 * Snapshot of technical indicators computed from a series of OHLC bars. Every field is nullable
 * because the source series may be too short to compute it (RSI(14) needs at least 15 bars, MA200
 * needs 200, etc.). All percentages are expressed as values, not fractions: 5% = 5, not 0.05.
 */
data class Indicators(
  /** Timestamp of the most recent bar used for the computation. */
  val asOf: Instant,
  /** Close of the most recent bar. */
  val price: BigDecimal,
  /** Relative Strength Index over 14 bars (Wilder smoothing). 0..100. */
  val rsi14: BigDecimal?,
  /** Simple moving average over 50 bars. */
  val ma50: BigDecimal?,
  /** Simple moving average over 200 bars. */
  val ma200: BigDecimal?,
  /** Percent change between the close 30 bars ago and the latest close. */
  val momentum30d: BigDecimal?,
  /** Percent change between the close 90 bars ago and the latest close. */
  val momentum90d: BigDecimal?,
  /** Percent change over the last ~21 trading days (1 month). */
  val perf1m: BigDecimal?,
  /** Percent change over the last ~63 trading days (3 months). */
  val perf3m: BigDecimal?,
  /** Percent change over the last ~252 trading days (1 year). */
  val perf1y: BigDecimal?,
  /** Drawdown from the 52-week high, as a negative percent (e.g. -12.5 = 12.5% below). */
  val drawdownFrom52wHigh: BigDecimal?,
  /** Latest volume relative to the 30-bar average volume (1.5 = 50% above average). */
  val volumeRelative30d: BigDecimal?,
  /** Percent distance from the latest close to MA50 (positive = above the MA). */
  val distanceToMa50Pct: BigDecimal?,
  /** Percent distance from the latest close to MA200. */
  val distanceToMa200Pct: BigDecimal?,
)
