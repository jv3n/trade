package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.earnings.domain.EarningsSnapshot

/**
 * Outbound port for the earnings panel on the dossier ticker. Returns the last 4 quarters of
 * reports + the next upcoming announcement date in one call so the front renders the whole
 * sub-block from a single payload.
 *
 * The active adapter is selected at call time by [RoutingEarningsClient] based on
 * `earnings.provider` (mock | finnhub).
 *
 * Contract for "no coverage" is a thrown [NoSuchElementException] — symmetric with
 * [com.portfolioai.market.infrastructure.market.MarketChartClient] for unknown symbols and the
 * analyst port. The `GlobalExceptionHandler` maps that to HTTP 404.
 */
interface EarningsClient {
  fun fetch(symbol: String): EarningsSnapshot
}
