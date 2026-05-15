package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.SymbolMatch
import com.portfolioai.market.domain.SymbolSearchClient
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches symbol search to the right adapter based on the runtime [ConfigKeys.MARKET_PROVIDER].
 * Mirrors [RoutingMarketChartClient] — same routing convention, same `@Primary` injection point.
 *
 * Both [MockSymbolSearchClient] and [TwelveDataSymbolSearchClient] are always wired ; this bean is
 * what Spring injects everywhere [SymbolSearchClient] is requested.
 */
@Component
@Primary
class RoutingSymbolSearchClient(
  @Qualifier("mockSymbolSearchClient") private val mock: SymbolSearchClient,
  @Qualifier("twelveDataSymbolSearchClient") private val twelveData: SymbolSearchClient,
  private val appConfig: AppConfigService,
) : SymbolSearchClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun search(query: String, limit: Int): List<SymbolMatch> {
    val provider = appConfig.getString(ConfigKeys.MARKET_PROVIDER)
    log.debug("Routing symbol search query='{}' provider={}", query, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.search(query, limit)
      ConfigKeys.PROVIDER_TWELVEDATA -> twelveData.search(query, limit)
      else -> throw IllegalArgumentException("Unknown market provider: '$provider'")
    }
  }
}
