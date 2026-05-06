package com.portfolioai.analyst.application

import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.analyst.infrastructure.analyst.AnalystRecommendationClient
import com.portfolioai.market.MarketConfig.Companion.ANALYST_CACHE
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

/**
 * Use-case service for the analyst recommendations panel. Thin wrapper around
 * [AnalystRecommendationClient] — its main job is to layer caching on top so the front can re-open
 * the dossier without burning the Finnhub free quota.
 *
 * Caching : Caffeine TTL aligned with [com.portfolioai.market.MarketConfig.ANALYST_CACHE] (15 min
 * by default, dynamic via the runtime config). Key is the uppercase symbol only — analyst snapshots
 * are per-symbol, no other dimension to factor in. SpEL uses `toUpperCase()` (Java method) rather
 * than `uppercase()` (Kotlin extension) because the cache key parser sees the JVM type, not the
 * Kotlin extension.
 */
@Service
class AnalystRecommendationService(private val client: AnalystRecommendationClient) {

  @Cacheable(ANALYST_CACHE, key = "#symbol.toUpperCase()")
  fun forSymbol(symbol: String): AnalystSnapshot = client.fetch(symbol)
}
