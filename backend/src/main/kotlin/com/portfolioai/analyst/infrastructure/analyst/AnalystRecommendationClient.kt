package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.analyst.domain.AnalystSnapshot

/**
 * Outbound port for the analyst recommendations panel on the dossier ticker. Returns the head-of-
 * stream consensus + a short history window in one call so the front renders the whole panel from a
 * single payload.
 *
 * The active adapter is selected at call time by [RoutingAnalystClient] based on `analyst.provider`
 * (mock | finnhub).
 *
 * Contract for "no coverage" is a thrown [NoSuchElementException] — symmetric with
 * [com.portfolioai.market.infrastructure.market.MarketChartClient] for unknown symbols. The
 * `GlobalExceptionHandler` maps that to HTTP 404.
 */
interface AnalystRecommendationClient {
  fun fetch(symbol: String): AnalystSnapshot
}
