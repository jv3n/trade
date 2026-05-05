package com.portfolioai.market.infrastructure.market

import com.portfolioai.market.domain.SymbolMatch

/**
 * Outbound port for ticker symbol search — backs the watchlist autocomplete and the future "is this
 * a real symbol ?" validation gate. Two implementations live in this package :
 * [MockSymbolSearchClient] (default in `application.yml`, ~30 seeded symbols + reserved test paths)
 * and [TwelveDataSymbolSearchClient] (live REST). Selection via `market.provider`.
 *
 * Returns provider-neutral [SymbolMatch] domain objects. The contract is :
 * - **Empty query → empty list** (don't blast the upstream with `q=""`).
 * - **No match → empty list** (not an exception). The caller decides what to do.
 * - **Upstream rate-limit / unreachable** →
 *   [com.portfolioai.market.domain.MarketUnavailableException] propagated out, surfaced as HTTP 503
 *   by the global handler.
 */
interface SymbolSearchClient {
  fun search(query: String, limit: Int): List<SymbolMatch>
}
