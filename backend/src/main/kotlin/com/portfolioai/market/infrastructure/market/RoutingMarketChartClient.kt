package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.MarketChart
import com.portfolioai.market.domain.MarketChartClient
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches every chart fetch to the right adapter based on the runtime value of
 * [ConfigKeys.MARKET_PROVIDER]. Replaces the previous boot-time `@ConditionalOnProperty` selection
 * — both [MockMarketChartClient] and [TwelveDataClient] are now always wired ; this bean is the one
 * Spring injects everywhere the [MarketChartClient] interface is requested ([@Primary]).
 *
 * **Why a delegating bean and not a `@Bean cacheableMarketChartClient` factory** — `@Cacheable`
 * needs to live on the concrete bean Spring proxies. The cache annotations stay on
 * [TwelveDataClient.fetchChart] (with the `'twelvedata|'` key prefix) ; this router goes through
 * the proxy on each call so the cache still triggers.
 *
 * **Switching providers at runtime** — when the user toggles `market.provider` from the
 * `/settings/configuration` page, the next call lands on the new adapter. No reboot, no cache flush
 * of the *other* provider's entries (cache keys are prefixed by adapter so they never collide).
 *
 * **Unknown provider** — surfaces as `IllegalArgumentException` ; mapped to HTTP 400 by
 * [com.portfolioai.shared.GlobalExceptionHandler]. Defensive, in practice [AppConfigService]
 * already validates the value at write time.
 */
@Component
@Primary
class RoutingMarketChartClient(
  @Qualifier("mockMarketChartClient") private val mock: MarketChartClient,
  @Qualifier("twelveDataClient") private val twelveData: MarketChartClient,
  private val appConfig: AppConfigService,
) : MarketChartClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetchChart(symbol: String, range: String, interval: String): MarketChart {
    val provider = appConfig.getString(ConfigKeys.MARKET_PROVIDER)
    log.debug("Routing chart fetch symbol={} provider={}", symbol, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.fetchChart(symbol, range, interval)
      ConfigKeys.PROVIDER_TWELVEDATA -> twelveData.fetchChart(symbol, range, interval)
      else -> throw IllegalArgumentException("Unknown market provider: '$provider'")
    }
  }
}
