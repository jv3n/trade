package com.portfolioai.market

import com.github.benmanes.caffeine.cache.Caffeine
import java.util.concurrent.TimeUnit
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.EnableCaching
import org.springframework.cache.caffeine.CaffeineCacheManager
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Caching for the `market/` module. Limits how often we hit Twelve Data — its free tier is quota-
 * bound (800 credits / day) and the data we read changes slowly enough that 15 min of staleness is
 * acceptable for the dossier ticker use case.
 *
 * Cache name `market-chart` is referenced by [@Cacheable] on each adapter's `fetchChart`. The cache
 * key is prefixed by the adapter name so a future provider can coexist without stepping on the
 * existing one.
 */
@Configuration
@EnableCaching
class MarketConfig {

  @Bean
  fun cacheManager(): CacheManager {
    val mgr = CaffeineCacheManager(MARKET_CHART_CACHE, NEWS_CACHE)
    mgr.setCaffeine(Caffeine.newBuilder().expireAfterWrite(15, TimeUnit.MINUTES).maximumSize(500))
    return mgr
  }

  companion object {
    const val MARKET_CHART_CACHE = "market-chart"
    /**
     * News headlines per ticker — same 15 min TTL as the chart cache, separate name so a flush of
     * one doesn't drop the other.
     */
    const val NEWS_CACHE = "news-by-symbol"
  }
}
