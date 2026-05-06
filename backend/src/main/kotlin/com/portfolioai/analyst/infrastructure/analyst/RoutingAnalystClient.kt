package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches every analyst fetch to the right adapter based on the runtime value of
 * [ConfigKeys.ANALYST_PROVIDER]. Same rationale as
 * [com.portfolioai.news.infrastructure.news.RoutingNewsClient] — both [MockAnalystClient] and
 * [FinnhubAnalystClient] are always wired, this bean is `@Primary` and routes per call so the user
 * can flip the toggle in `/settings/configuration` without a reboot.
 *
 * Cache lives one layer up on [com.portfolioai.analyst.application.AnalystRecommendationService]
 * keyed on the uppercase symbol only — the provider is deliberately **not** in the key so a switch
 * lands the new feed on the next call rather than retaining a stale entry.
 */
@Component
@Primary
class RoutingAnalystClient(
  @Qualifier("mockAnalystClient") private val mock: AnalystRecommendationClient,
  @Qualifier("finnhubAnalystClient") private val finnhub: AnalystRecommendationClient,
  private val appConfig: AppConfigService,
) : AnalystRecommendationClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetch(symbol: String): AnalystSnapshot {
    val provider = appConfig.getString(ConfigKeys.ANALYST_PROVIDER)
    log.debug("Routing analyst fetch symbol={} provider={}", symbol, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.fetch(symbol)
      ConfigKeys.PROVIDER_FINNHUB -> finnhub.fetch(symbol)
      else -> throw IllegalArgumentException("Unknown analyst provider: '$provider'")
    }
  }
}
