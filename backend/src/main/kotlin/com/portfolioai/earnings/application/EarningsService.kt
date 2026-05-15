package com.portfolioai.earnings.application

import com.portfolioai.earnings.domain.EarningsClient
import com.portfolioai.earnings.domain.EarningsSnapshot
import com.portfolioai.market.MarketConfig.Companion.EARNINGS_CACHE
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service

/**
 * Use-case service for the earnings panel. Thin wrapper around [EarningsClient] — its main job is
 * to layer caching on top so the front can re-open the dossier without burning the Finnhub free
 * quota.
 *
 * Caching : Caffeine TTL aligned with [com.portfolioai.market.MarketConfig.EARNINGS_CACHE] (15 min
 * by default, dynamic via the runtime config). Key is the uppercase symbol only — earnings
 * snapshots are per-symbol, no other dimension to factor in. SpEL uses `toUpperCase()` (Java
 * method) rather than `uppercase()` (Kotlin extension) because the cache key parser sees the JVM
 * type, not the Kotlin extension.
 */
@Service
class EarningsService(private val client: EarningsClient) {

  @Cacheable(EARNINGS_CACHE, key = "#symbol.toUpperCase()")
  fun forSymbol(symbol: String): EarningsSnapshot = client.fetch(symbol)
}
