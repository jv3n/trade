package com.portfolioai.market.domain

/**
 * Maps a ticker to the SPDR sector ETF that tracks its sector — used by the chart's "Sector"
 * benchmark overlay so a user can compare e.g. AAPL to XLK (Technology) instead of the broad
 * S&P 500.
 *
 * The mapping is opinionated to the 11 GICS sectors covered by SPDR's Select Sector SPDR ETF
 * family. Provider-neutral — both adapters return the same shape.
 *
 * - [sector] — the GICS sector label as resolved by the upstream (e.g. `"Technology"`).
 * - [etfSymbol] — the SPDR ETF ticker (`XLK`, `XLF`, …).
 * - [etfName] — the human-readable label shown in the chart legend / tooltip.
 */
data class SectorBenchmark(val sector: String, val etfSymbol: String, val etfName: String)
