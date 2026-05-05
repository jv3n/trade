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
 * Both [MockSectorClassifier] and [TwelveDataSectorClassifier] are always wired ; this bean is what
 * Spring injects everywhere [SectorClassifier] is requested.
 */
@Component
@Primary
class RoutingSectorClassifier(
  @Qualifier("mockSectorClassifier") private val mock: SectorClassifier,
  @Qualifier("twelveDataSectorClassifier") private val twelveData: SectorClassifier,
  private val appConfig: AppConfigService,
) : SectorClassifier {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun classify(symbol: String): SectorBenchmark {
    val provider = appConfig.getString(ConfigKeys.MARKET_PROVIDER)
    log.debug("Routing sector classify symbol='{}' provider={}", symbol, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.classify(symbol)
      ConfigKeys.PROVIDER_TWELVEDATA -> twelveData.classify(symbol)
      else -> throw IllegalArgumentException("Unknown market provider: '$provider'")
    }
  }
}
