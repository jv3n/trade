package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Component

/**
 * Dispatches every market-radar snapshot to the right adapter based on the runtime value of
 * [ConfigKeys.SCREENER_PROVIDER]. Mirrors `RoutingMarketChartClient` / `RoutingNewsClient` — all
 * three concrete impls ([MockMarketScreenerClient], [PolygonMarketScreenerClient],
 * [FmpMarketScreenerClient]) are always wired ; this bean is the one Spring injects everywhere the
 * [MarketScreenerClient] interface is requested ([@Primary]).
 *
 * **Switching providers at runtime** — when the user toggles `screener.provider` from the
 * `/settings/configuration` page, the next call lands on the new adapter. No reboot.
 *
 * **No cache here** — the underlying adapters are responsible for their own caching policy. The
 * Mock adapter is synchronous in-memory ; the Polygon / FMP adapters have no cache v0.3 (filed as
 * follow-up Phase 6 (1ter)) because the free-tier rate limits and the EOD-only nature reshape the
 * cache trade-off vs the per-ticker dossier caches in `market/`.
 *
 * **Unknown provider** — surfaces as `IllegalArgumentException` ; mapped to HTTP 400 by
 * [com.portfolioai.shared.GlobalExceptionHandler]. Defensive, in practice [AppConfigService]
 * already validates the value at write time via [ConfigKeys.ENUM_KEYS].
 */
@Component
@Primary
class RoutingMarketScreenerClient(
  @Qualifier("mockMarketScreenerClient") private val mock: MarketScreenerClient,
  @Qualifier("polygonMarketScreenerClient") private val polygon: MarketScreenerClient,
  @Qualifier("fmpMarketScreenerClient") private val fmp: MarketScreenerClient,
  private val appConfig: AppConfigService,
) : MarketScreenerClient {
  private val log = LoggerFactory.getLogger(javaClass)

  override fun snapshotMovers(universe: ScreenerUniverse): List<TickerMover> {
    val provider = appConfig.getString(ConfigKeys.SCREENER_PROVIDER)
    log.debug("Routing screener snapshot universe={} provider={}", universe, provider)
    return when (provider) {
      ConfigKeys.PROVIDER_MOCK -> mock.snapshotMovers(universe)
      ConfigKeys.PROVIDER_POLYGON -> polygon.snapshotMovers(universe)
      ConfigKeys.PROVIDER_FMP -> fmp.snapshotMovers(universe)
      else -> throw IllegalArgumentException("Unknown screener provider: '$provider'")
    }
  }
}
