package com.portfolioai.market.application

import com.portfolioai.market.MarketConfig.Companion.SYMBOL_SEARCH_CACHE
import com.portfolioai.market.application.SymbolSearchService.Companion.DEFAULT_LIMIT
import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.market.infrastructure.market.SymbolSearchClient
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.cache.annotation.Cacheable
import org.springframework.context.annotation.Lazy
import org.springframework.stereotype.Service

/**
 * Use-case service in front of [SymbolSearchClient]. Two responsibilities :
 * 1. **Cache** — search results are stable on the timescale of a watchlist add ; the Caffeine TTL
 *    pulled from `market.cache.ttl-minutes` is enough. Cache key uses the lowercased query so
 *    `AAPL` and `aapl` share the same entry.
 * 2. **Validation primitive** — [validate] is the single hook the watchlist (and any future caller)
 *    uses to reject unknown symbols. It delegates to [search] (the cached path) and asks "did the
 *    upstream return an exact match on this symbol ?", case-insensitive.
 *
 * **Cache key has no provider prefix** — a switch from `mock` to `twelvedata` (or back) at runtime
 * may serve a few stale entries until the TTL expires (15 min by default, 5–60 min configurable via
 * `market.cache.ttl-minutes`). Acceptable for an interactive autocomplete where the user can just
 * retype after the staleness window. Add a `@<provider>|` prefix to the SpEL key if we ever want
 * zero-second consistency on provider switch.
 *
 * **AOP gotcha — [validate] does NOT call [search] via `this`.** A Kotlin/Spring `this.method()`
 * intra-bean call goes through the raw object reference and bypasses the AOP proxy — the
 * `@Cacheable` annotation has no effect, and every `watchlist.add()` would burn a Twelve Data
 * credit. Same trap as `@Async` self-calls. We inject the bean back into itself with `@Lazy`
 * (avoids the circular dependency at construction time) and route validation through the proxy.
 */
@Service
class SymbolSearchService(private val client: SymbolSearchClient) {
  private val log = LoggerFactory.getLogger(javaClass)

  /**
   * Self-reference resolved through Spring's AOP proxy — required so [validate] hits the
   * `@Cacheable` annotation on [search]. `@Lazy` defers the lookup to first access (avoids the
   * circular dependency `SymbolSearchService → SymbolSearchService` at bean creation).
   *
   * Nullable with a `null` default so plain Kotlin unit tests (which instantiate the class outside
   * Spring) don't crash with `UninitializedPropertyAccessException`. [validate] falls back to
   * `this` in that case — the cache annotation has no effect outside the Spring context anyway, so
   * behaviour is unchanged.
   */
  @Autowired @Lazy private var self: SymbolSearchService? = null

  // SpEL key uses `.toLowerCase()` — the Java method, NOT the Kotlin extension `.lowercase()`.
  // SpEL only sees JVM methods, the Kotlin extension would raise `EL1004E: Method lowercase()
  // cannot be found on type java.lang.String` at evaluation time. Same gotcha as the news cache.
  @Cacheable(SYMBOL_SEARCH_CACHE, key = "#query.trim().toLowerCase() + '|' + #limit")
  fun search(query: String, limit: Int = DEFAULT_LIMIT): List<SymbolMatch> {
    val results = client.search(query.trim(), limit.coerceIn(1, MAX_LIMIT))
    log.debug("Symbol search query='{}' limit={} → {} matches", query, limit, results.size)
    return results
  }

  /**
   * `true` if the upstream search returns an entry whose symbol matches [symbol] exactly
   * (case-insensitive). Used by [com.portfolioai.watchlist.application.WatchlistService] to gate
   * the add path.
   *
   * Calls through `self` (the proxied bean, not `this`) so the cache annotation on [search] fires.
   * Asks the same page size [DEFAULT_LIMIT] as the autocomplete dropdown — the two paths share a
   * single cache entry per query rather than duplicating credits.
   */
  fun validate(symbol: String): Boolean {
    val trimmed = symbol.trim()
    if (trimmed.isEmpty()) return false
    return (self ?: this).search(trimmed, DEFAULT_LIMIT).any {
      it.symbol.equals(trimmed, ignoreCase = true)
    }
  }

  companion object {
    const val DEFAULT_LIMIT = 10
    const val MAX_LIMIT = 50
  }
}
