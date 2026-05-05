package com.portfolioai.market.infrastructure.http

import com.portfolioai.market.application.SymbolSearchService
import com.portfolioai.market.application.dto.SymbolMatchDto
import com.portfolioai.market.application.dto.toDto
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Symbol search endpoint backing the watchlist autocomplete in the front. Separate controller from
 * [MarketController] — different URL space (`/api/market/symbols` vs `/api/market/ticker`),
 * different lifecycle (search is a typeahead, ticker dossier is a single-shot fetch), and a clean
 * split makes the OpenAPI surface readable.
 *
 * `GET /api/market/symbols/search?q=<query>&limit=<n>` :
 * - `q` is required ; an empty / blank query short-circuits to `[]` without hitting the upstream.
 *   Capped at [MAX_QUERY_LENGTH] characters — anything longer is rejected as 400 to fail fast
 *   rather than burn upstream credits and balloon the cache key.
 * - `limit` defaults to [SymbolSearchService.DEFAULT_LIMIT] and is clamped to
 *   [SymbolSearchService.MAX_LIMIT] by the service.
 * - Errors surface through [com.portfolioai.shared.GlobalExceptionHandler] : provider unreachable /
 *   rate-limited → 503.
 */
@RestController
@RequestMapping("/api/market/symbols")
class SymbolSearchController(private val service: SymbolSearchService) {

  @GetMapping("/search")
  fun search(
    @RequestParam q: String,
    @RequestParam(defaultValue = "${SymbolSearchService.DEFAULT_LIMIT}") limit: Int,
  ): List<SymbolMatchDto> {
    require(q.length <= MAX_QUERY_LENGTH) { "Search query exceeds $MAX_QUERY_LENGTH characters" }
    return service.search(q, limit).map { it.toDto() }
  }

  companion object {
    /**
     * Twelve Data's `/symbol_search` accepts up to a few hundred characters but in practice no
     * legitimate ticker query goes past 20-30 chars. 100 leaves headroom for issuer-name searches
     * ("Toronto-Dominion Bank") while bounding the cache-key footprint and the URL we emit.
     */
    const val MAX_QUERY_LENGTH = 100
  }
}
