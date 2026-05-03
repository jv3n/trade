package com.portfolioai.market.domain

import java.math.BigDecimal
import java.time.Instant

/**
 * Latest quote for a single ticker — a snapshot of metadata + price at [asOf]. Comes from the
 * market data provider ; values may be missing (null) when the provider does not return them for
 * this symbol or this asset class.
 */
data class TickerQuote(
  val symbol: String,
  val name: String?,
  val currency: String?,
  val exchange: String?,
  val price: BigDecimal,
  val fiftyTwoWeekHigh: BigDecimal?,
  val fiftyTwoWeekLow: BigDecimal?,
  val asOf: Instant,
)
