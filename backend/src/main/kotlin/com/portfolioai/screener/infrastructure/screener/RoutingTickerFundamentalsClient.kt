package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.TickerFundamentals
import com.portfolioai.screener.domain.TickerFundamentalsClient
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * `@Primary` dispatcher for [TickerFundamentalsClient] — routes per-call to the adapter matching
 * the **active screener provider** (`screener.provider`, same key the gainers snapshot uses, so
 * float comes from the same vendor as the movers). Reading the key per-call honours a runtime
 * provider switch from `/settings/configuration` without a reboot.
 *
 * Providers without a fundamentals adapter yet (e.g. Polygon) fall back to
 * [TickerFundamentals.EMPTY] — the radar simply shows « — » for float / volume rather than failing.
 */
@Component
@Primary
class RoutingTickerFundamentalsClient(
  private val mock: MockTickerFundamentalsClient,
  private val fmp: FmpTickerFundamentalsClient,
  private val appConfig: AppConfigService,
) : TickerFundamentalsClient {
  override fun fetch(symbol: String): TickerFundamentals =
    when (appConfig.getString(ConfigKeys.SCREENER_PROVIDER)) {
      ConfigKeys.PROVIDER_FMP -> fmp.fetch(symbol)
      ConfigKeys.PROVIDER_MOCK -> mock.fetch(symbol)
      else -> TickerFundamentals.EMPTY
    }
}
