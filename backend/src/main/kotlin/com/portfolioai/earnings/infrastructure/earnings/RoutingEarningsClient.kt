package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.earnings.domain.EarningsSnapshot
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches every earnings fetch to the right adapter based on the runtime value of
 * [ConfigKeys.EARNINGS_PROVIDER]. Same rationale as
 * [com.portfolioai.analyst.infrastructure.analyst.RoutingAnalystClient] — both [MockEarningsClient]
 * and [FinnhubEarningsClient] are always wired, this bean is `@Primary` and routes per call so the
 * user can flip the toggle in `/settings/configuration` without a reboot.
 *
 * Cache lives one layer up on [com.portfolioai.earnings.application.EarningsService] keyed on the
 * uppercase symbol only — the provider is deliberately **not** in the key so a switch lands the new
 * feed on the next call rather than retaining a stale entry.
 */
@Component
@Primary
class RoutingEarningsClient(
  @Qualifier("mockEarningsClient") private val mock: EarningsClient,
  @Qualifier("finnhubEarningsClient") private val finnhub: EarningsClient,
  private val appConfig: AppConfigService,
) : EarningsClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun fetch(symbol: String): EarningsSnapshot {
    val provider = appConfig.getString(ConfigKeys.EARNINGS_PROVIDER)
    log.debug("Routing earnings fetch symbol={} provider={}", symbol, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.fetch(symbol)
      ConfigKeys.PROVIDER_FINNHUB -> finnhub.fetch(symbol)
      else -> throw IllegalArgumentException("Unknown earnings provider: '$provider'")
    }
  }
}
