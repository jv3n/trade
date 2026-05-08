package com.portfolioai.market.application

import com.portfolioai.market.MarketConfig.Companion.SECTOR_CACHE
import com.portfolioai.market.domain.SectorBenchmark
import com.portfolioai.market.infrastructure.market.SectorClassifier
import org.slf4j.LoggerFactory
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

/**
 * Use-case service in front of [SectorClassifier]. Wraps the adapter call with a Caffeine cache so
 * repeated clicks on "Sector" for the same ticker don't burn a Twelve Data credit each time.
 *
 * **Cache key uses the uppercase symbol** so AAPL / aapl share the same entry. SpEL
 * `.toUpperCase()` — the Java method, not Kotlin's `.uppercase()`. Same gotcha as the news / search
 * caches. The current callers (controller, programmatic invocations from inside the bean graph)
 * already pass the upper form ; the SpEL is kept defensive at the cache boundary so direct calls
 * from a future caller don't accidentally split the cache between cases.
 *
 * **No provider prefix on the key** — a switch from `mock` to `twelvedata` (or back) at runtime may
 * serve a few stale entries until the TTL expires (15 min by default, 5–60 min configurable via
 * `market.cache.ttl-minutes`). Acceptable for an interactive overlay where the user can re-click
 * after the staleness window. Consistent with [SymbolSearchService].
 *
 * Errors are **not cached** — Spring `@Cacheable` doesn't store exceptions by default. A fresh call
 * will retry the upstream, which is the right behaviour for transient 503s ; a 404 will hit the
 * upstream again on each click but at < 1 / minute that's fine.
 */
@Service
class SectorClassifierService(private val classifier: SectorClassifier) {
  private val log = LoggerFactory.getLogger(javaClass)

  @Cacheable(SECTOR_CACHE, key = "#symbol.trim().toUpperCase()")
  fun classify(symbol: String): SectorBenchmark {
    val result = classifier.classify(symbol)
    log.debug("Sector classify {} → {} ({})", symbol, result.etfSymbol, result.sector)
    return result
  }
}
