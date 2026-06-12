package com.portfolioai.screener.domain

/**
 * Outbound port — fetches the per-ticker fields ([TickerFundamentals]) that the gainers snapshot
 * doesn't carry (float, premarket volume). Called once per enrichment candidate by
 * `MarketScreenerService.refresh`.
 *
 * **Best-effort contract**: implementations must NOT throw on an upstream blip — they return
 * [TickerFundamentals.EMPTY] so a fundamentals failure leaves the row's float/volume null instead
 * of failing the whole radar refresh.
 */
interface TickerFundamentalsClient {
  fun fetch(symbol: String): TickerFundamentals
}
