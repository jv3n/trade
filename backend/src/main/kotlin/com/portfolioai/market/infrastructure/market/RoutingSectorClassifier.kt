package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.SectorBenchmark
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches sector classification to the right adapter based on the runtime
 * [ConfigKeys.MARKET_PROVIDER]. Mirrors [RoutingSymbolSearchClient] / [RoutingMarketChartClient] —
 * same routing convention, same `@Primary` injection point.
 *
 * **Note on the "live" provider** — unlike the chart and symbol-search routes which call Twelve
 * Data when `market.provider=twelvedata`, the sector route delegates to Finnhub regardless of the
 * `market.provider` value (when not `mock`). The reason : Twelve Data `/profile` is paid-tier only
 * (free-tier returns 401 / `auth-failed`), making the sector feature unusable on the plan we
 * standardised the project on. Finnhub `/stock/profile2` covers the same need on the free tier and
 * the Finnhub API key is already configured for news / analyst / earnings. We keep the toggle
 * binary (mock vs live) and document the implementation detail rather than introducing a separate
 * `sector.provider` runtime key — the user only sees the macro switch.
 *
 * Cache lives one layer up on [com.portfolioai.market.application.SectorClassifierService] under
 * `@Cacheable("sector-by-symbol", key = "#symbol.toUpperCase()")` — the provider is deliberately
 * **not** in the key. Same choice as the news / analyst / earnings routings : a toggle `mock →
 * live` lands the new feed on the next call after the 15-min TTL elapses ; the chart cache's
 * `'twelvedata|'` key prefix is the deliberate outlier (see `docs/technique/architecture.md >
 * Décisions techniques notables > Caching côté serveur`).
 */
@Component
@Primary
class RoutingSectorClassifier(
  @Qualifier("mockSectorClassifier") private val mock: SectorClassifier,
  @Qualifier("finnhubSectorClassifier") private val finnhub: SectorClassifier,
  private val appConfig: AppConfigService,
) : SectorClassifier {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun classify(symbol: String): SectorBenchmark {
    val provider = appConfig.getString(ConfigKeys.MARKET_PROVIDER)
    log.debug("Routing sector classify symbol='{}' provider={}", symbol, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.classify(symbol)
      ConfigKeys.PROVIDER_TWELVEDATA -> finnhub.classify(symbol)
      else -> throw IllegalArgumentException("Unknown market provider: '$provider'")
    }
  }
}
