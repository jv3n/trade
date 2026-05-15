package com.portfolioai.market.application

import com.portfolioai.market.MarketConfig.Companion.SYMBOL_SEARCH_CACHE
import com.portfolioai.market.application.SymbolSearchService.Companion.DEFAULT_LIMIT
import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.market.domain.SymbolSearchClient
import org.slf4j.LoggerFactory
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

/**
 * Use-case service in front of [SymbolSearchClient]. Cache layer : search results are stable on the
 * timescale of a watchlist add ; the Caffeine TTL pulled from `market.cache.ttl-minutes` is enough.
 * Cache key uses the lowercased query so `AAPL` and `aapl` share the same entry.
 *
 * **Cache key has no provider prefix** — a switch from `mock` to `twelvedata` (or back) at runtime
 * may serve a few stale entries until the TTL expires (15 min by default, 5–60 min configurable via
 * `market.cache.ttl-minutes`). Acceptable for an interactive autocomplete where the user can just
 * retype after the staleness window. Add a `@<provider>|` prefix to the SpEL key if we ever want
 * zero-second consistency on provider switch.
 *
 * **Validation lives in [SymbolValidator]**, a separate `@Component` that depends on this service.
 * The split is structural : the watchlist add path needs the cached `search()` to fire its
 * `@Cacheable` annotation, but a Kotlin/Spring `this.method()` intra-bean call bypasses the AOP
 * proxy — every `watchlist.add()` would burn a Twelve Data credit. Routing validation through a
 * second bean lets Spring inject the proxy by construction, with no `@Lazy self` hack.
 */
@Service
class SymbolSearchService(private val client: SymbolSearchClient) {
  private val log = LoggerFactory.getLogger(javaClass)

  // SpEL key uses `.toLowerCase()` — the Java method, NOT the Kotlin extension `.lowercase()`.
  // SpEL only sees JVM methods, the Kotlin extension would raise `EL1004E: Method lowercase()
  // cannot be found on type java.lang.String` at evaluation time. Same gotcha as the news cache.
  @Cacheable(SYMBOL_SEARCH_CACHE, key = "#query.trim().toLowerCase() + '|' + #limit")
  fun search(query: String, limit: Int = DEFAULT_LIMIT): List<SymbolMatch> {
    val results = client.search(query.trim(), limit.coerceIn(1, MAX_LIMIT))
    log.debug("Symbol search query='{}' limit={} → {} matches", query, limit, results.size)
    return results
  }

  companion object {
    const val DEFAULT_LIMIT = 10
    const val MAX_LIMIT = 50
  }
}
