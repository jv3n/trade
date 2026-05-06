package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.SectorBenchmark

/**
 * Outbound port for sector classification — resolves a ticker symbol to the SPDR sector ETF that
 * tracks its sector. Backs the "Sector" benchmark overlay on the dossier ticker chart. Two
 * implementations live in this package : [MockSectorClassifier] (default, hand-curated table) and
 * [FinnhubSectorClassifier] (live REST `/stock/profile2`). Selection via `market.provider`. The
 * "live" path uses Finnhub rather than Twelve Data because Twelve Data's `/profile` is paid-tier
 * only — see [RoutingSectorClassifier] for the routing rationale.
 *
 * Contract :
 * - **Symbol resolves to a GICS sector covered by SPDR** → returns [SectorBenchmark].
 * - **Symbol unknown or sector outside the SPDR mapping** → throws [NoSuchElementException],
 *   surfaced as HTTP 404 by the global handler. The caller (frontend) shows an inline "no sector
 *   benchmark available" rather than a hard error — the rest of the chart stays interactive.
 * - **Upstream rate-limit / unreachable** →
 *   [com.portfolioai.market.domain.MarketUnavailableException] propagated, surfaced as HTTP 503.
 */
interface SectorClassifier {
  fun classify(symbol: String): SectorBenchmark
}
