package com.portfolioai.market

import com.github.benmanes.caffeine.cache.Caffeine
import java.util.concurrent.TimeUnit
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.EnableCaching
import org.springframework.cache.caffeine.CaffeineCacheManager
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Caching for the `market/` module. Limits how often we hit Yahoo Finance — their public endpoint
 * is aggressively rate-limited (429s under load), and the data we read changes slowly enough that
 * 15 min of staleness is acceptable for the dossier ticker use case.
 *
 * Cache name `yahoo-chart` is referenced by [@Cacheable] on `YahooClient.fetchChart`.
 */
@Configuration
@EnableCaching
class MarketConfig {

  @Bean
  fun cacheManager(): CacheManager {
    val mgr = CaffeineCacheManager(YAHOO_CHART_CACHE)
    mgr.setCaffeine(Caffeine.newBuilder().expireAfterWrite(15, TimeUnit.MINUTES).maximumSize(500))
    return mgr
  }

  companion object {
    const val YAHOO_CHART_CACHE = "yahoo-chart"
  }
}
