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
  /**
   * What kind of instrument this is — drives which features apply on the front. Most notably the
   * Sector benchmark overlay only makes sense for individual stocks (an ETF is itself a sector or a
   * broad index). May be `null` when the upstream provider did not surface the type for this symbol
   * — the front degrades by hiding type-specific affordances rather than guessing.
   */
  val instrumentType: InstrumentType?,
)

/**
 * Coarse classification of the instrument behind a ticker. We collapse the dozens of categories
 * Twelve Data surfaces (`Common Stock`, `Preferred Stock`, `American Depositary Receipt`, `ETF`,
 * `Mutual Fund`, `Index`, `Currency`, `Cryptocurrency`…) into the four buckets that drive UI
 * decisions today :
 *
 * - **STOCK** — individual equity (common, preferred, ADR). Sector benchmark applies.
 * - **ETF** — exchange-traded fund. Sector benchmark doesn't apply (the ETF *is* a sector or a
 *   broad market) ; the front hides that toggle.
 * - **INDEX** — raw market index (S&P 500, NASDAQ Composite). Like ETFs, no sector benchmark.
 * - **OTHER** — anything else (mutual funds, crypto, FX, commodities). Conservative default for
 *   anything we don't explicitly recognise — the front treats it like ETF (no Sector toggle).
 */
enum class InstrumentType {
  STOCK,
  ETF,
  INDEX,
  OTHER,
}
