package com.portfolioai.screener.application.dto

import com.portfolioai.screener.domain.TickerMover
import java.math.BigDecimal

/**
 * REST representation of [TickerMover]. Keeps the domain free of Jackson concerns and lets the wire
 * format evolve independently — e.g. we may later expose `gapPct` as a number rounded for display
 * while the domain keeps the precise computation.
 */
data class TickerMoverDto(
  val symbol: String,
  val name: String,
  val price: BigDecimal,
  val previousClose: BigDecimal,
  /** Signed percentage — positive for a gap-up, negative for a gap-down. */
  val gapPct: BigDecimal,
  val volume: Long,
  val volumeAvg30d: Long,
  /** Multiple of the 30-day average volume. 1.0 = normal, 5.0 = five times. */
  val volumeRatio: BigDecimal,
  val marketCapUsd: Long,
  val exchange: String,
  val sector: String?,
  /**
   * Free-float shares. Nullable — filled by the enrichment step (see [TickerMover.floatShares]).
   */
  val floatShares: Long?,
  /** Premarket session volume (shares). Nullable (see [TickerMover.premarketVolume]). */
  val premarketVolume: Long?,
)

fun TickerMover.toDto(): TickerMoverDto =
  TickerMoverDto(
    symbol = symbol,
    name = name,
    price = price,
    previousClose = previousClose,
    gapPct = gapPct,
    volume = volume,
    volumeAvg30d = volumeAvg30d,
    volumeRatio = volumeRatio,
    marketCapUsd = marketCapUsd,
    exchange = exchange,
    sector = sector,
    floatShares = floatShares,
    premarketVolume = premarketVolume,
  )
