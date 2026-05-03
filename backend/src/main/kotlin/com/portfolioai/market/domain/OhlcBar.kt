package com.portfolioai.market.domain

import java.math.BigDecimal
import java.time.Instant

/**
 * Single OHLCV bar at a given timestamp. Returned by the market data provider and consumed by the
 * indicator calculator. No JPA — this is a pure value object that crosses module boundaries.
 */
data class OhlcBar(
  val timestamp: Instant,
  val open: BigDecimal,
  val high: BigDecimal,
  val low: BigDecimal,
  val close: BigDecimal,
  val volume: Long,
)
