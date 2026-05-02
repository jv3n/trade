package com.portfolioai.market.domain

/**
 * Complete view of a ticker at a moment : its current quote, its historical OHLC series, and the
 * indicators computed from that series. This is what the LLM narrative pipeline will consume — and
 * what the UI dossier ticker will display.
 *
 * [indicators] is null only when the bar series is empty (no provider data at all).
 */
data class TickerSnapshot(
  val quote: TickerQuote,
  val bars: List<OhlcBar>,
  val indicators: Indicators?,
)
