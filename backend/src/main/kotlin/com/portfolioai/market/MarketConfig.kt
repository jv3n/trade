package com.portfolioai.market

import com.github.benmanes.caffeine.cache.Caffeine
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigChangedEvent
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.MarketConfig.Companion.MARKET_CHART_CACHE
import com.portfolioai.market.MarketConfig.Companion.NEWS_CACHE
import java.util.concurrent.TimeUnit
import org.slf4j.LoggerFactory
import org.springframework.cache.annotation.EnableCaching
import org.springframework.cache.caffeine.CaffeineCacheManager
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.event.EventListener

/**
 * Caching for the `market/` module. Limits how often we hit Twelve Data — its free tier is quota-
 * bound (800 credits / day) and the data we read changes slowly enough that 15 min of staleness is
 * acceptable for the dossier ticker use case.
 *
 * Both [MARKET_CHART_CACHE] and [NEWS_CACHE] share a single Caffeine spec — keeping them under one
 * [CaffeineCacheManager] is enough for v1. If we ever want different TTLs per cache (e.g. news a
 * bit fresher), we'd switch to per-cache configuration via `setCacheSpecification` or run two
 * managers side by side.
 *
 * **Dynamic TTL** — the TTL is read at boot from [AppConfigService] (default 15 min, override
 * editable from `/settings/configuration`). When the value changes at runtime, the
 * [@EventListener][EventListener] below rebuilds the Caffeine spec via `setCaffeine(...)` ; the
 * trade-off is that the rebuild **invalidates existing entries** (Spring's `CaffeineCacheManager`
 * recreates its internal caches when reconfigured). Acceptable cost — TTL changes are rare and we'd
 * lose at most 15 min of warm cache.
 */
@Configuration
@EnableCaching
class MarketConfig {

  @Bean
  fun cacheManager(appConfig: AppConfigService): CaffeineCacheManager {
    val mgr =
      CaffeineCacheManager(MARKET_CHART_CACHE, NEWS_CACHE, SYMBOL_SEARCH_CACHE, SECTOR_CACHE)
    mgr.setCaffeine(buildSpec(appConfig.getInt(ConfigKeys.CACHE_TTL_MINUTES)))
    return mgr
  }

  companion object {
    const val MARKET_CHART_CACHE = "market-chart"

    /**
     * News headlines per ticker — same TTL as the chart cache, separate name so a flush of one
     * doesn't drop the other.
     */
    const val NEWS_CACHE = "news-by-symbol"

    /**
     * Symbol search results — keyed on the lowercased query + limit. Same shared TTL as the other
     * caches today. Search results are stable on the order of hours/days (a new IPO is rare on the
     * timescale of a watchlist add), so a longer dedicated TTL would be a natural follow-up if we
     * want to spare credits ; v1 keeps everything aligned for simplicity.
     */
    const val SYMBOL_SEARCH_CACHE = "symbol-search"

    /**
     * Sector → SPDR ETF mapping per symbol — keyed on the uppercase ticker. A stock's sector
     * changes only on a corporate event (rare), so the 15 min shared TTL is generous. Backs the
     * "Sector" benchmark overlay on the dossier ticker chart.
     */
    const val SECTOR_CACHE = "sector-by-symbol"

    internal fun buildSpec(ttlMinutes: Int): Caffeine<Any, Any> =
      Caffeine.newBuilder().expireAfterWrite(ttlMinutes.toLong(), TimeUnit.MINUTES).maximumSize(500)
  }
}

/**
 * Listens for [ConfigChangedEvent] and rebuilds the Caffeine spec when the cache TTL setting
 * changes. Lives outside [MarketConfig] so the configuration class stays a simple bean factory and
 * the listener has its own clean lifecycle (plain `@Component`, easy to mock in tests).
 */
@org.springframework.stereotype.Component
class CacheTtlListener(
  private val cacheManager: CaffeineCacheManager,
  private val appConfig: AppConfigService,
) {
  private val log = LoggerFactory.getLogger(javaClass)

  @EventListener
  fun onConfigChanged(event: ConfigChangedEvent) {
    if (event.key != ConfigKeys.CACHE_TTL_MINUTES) return
    val ttl = appConfig.getInt(ConfigKeys.CACHE_TTL_MINUTES)
    log.info("Rebuilding market cache spec : ttl={}min", ttl)
    cacheManager.setCaffeine(MarketConfig.buildSpec(ttl))
  }
}
