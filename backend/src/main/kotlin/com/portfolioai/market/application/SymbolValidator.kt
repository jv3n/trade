package com.portfolioai.market.application

import com.portfolioai.market.application.SymbolSearchService.Companion.DEFAULT_LIMIT
import org.springframework.stereotype.Component

/**
 * Decides whether a user-supplied ticker exists in the upstream provider's catalog. Single hook the
 * watchlist add path (and any future caller) uses to reject unknown symbols before persisting.
 *
 * **Why this is a separate bean from [SymbolSearchService].** `validate` needs the cached
 * `search()` to fire its `@Cacheable` annotation, but a Kotlin/Spring `this.method()` intra-bean
 * call goes through the raw object reference and bypasses the AOP proxy — burning a Twelve Data
 * credit on every `watchlist.add()`. Splitting validation into its own `@Component` that depends on
 * [SymbolSearchService] routes the call through Spring's injected proxy by construction, with no
 * `@Lazy self` injection hack to maintain.
 *
 * Exact-match semantics : the upstream search returns relevance-ranked entries, but [exists] only
 * accepts the entry whose `symbol` field matches [symbol] exactly (case-insensitive). A query for
 * `AAP` may return `AAPL` first, but `exists("AAP")` is `true` only because `AAP` itself is also a
 * real ticker (Advance Auto Parts) — we don't want fuzzy promotion to slip a typo into the
 * watchlist.
 */
@Component
class SymbolValidator(private val search: SymbolSearchService) {

  /**
   * `true` if the upstream search returns an entry whose symbol matches [symbol] exactly
   * (case-insensitive). Blank input short-circuits to `false` without calling the upstream.
   *
   * Asks the same page size as the autocomplete dropdown ([DEFAULT_LIMIT]) so the two paths share a
   * single cache entry per query rather than duplicating credits.
   */
  fun exists(symbol: String): Boolean {
    val trimmed = symbol.trim()
    if (trimmed.isEmpty()) return false
    return search.search(trimmed, DEFAULT_LIMIT).any {
      it.symbol.equals(trimmed, ignoreCase = true)
    }
  }
}
