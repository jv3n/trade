package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.TickerFundamentals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [RoutingTickerFundamentalsClient] — verifies the per-call dispatch keyed on the active
 * `screener.provider`, so float/volume comes from the same vendor as the gainers snapshot, and a
 * provider without a fundamentals adapter degrades to [TickerFundamentals.EMPTY] rather than
 * erroring.
 */
class RoutingTickerFundamentalsClientTest {

  private val mockAdapter: MockTickerFundamentalsClient = mock()
  private val fmpAdapter: FmpTickerFundamentalsClient = mock()
  private val appConfig: AppConfigService = mock()
  private val router = RoutingTickerFundamentalsClient(mockAdapter, fmpAdapter, appConfig)

  @Test
  fun `routes to the mock adapter when the active provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mockAdapter.fetch("GNS")).doReturn(TickerFundamentals(12_000_000L, 800_000L))

    val f = router.fetch("GNS")

    assertEquals(12_000_000L, f.floatShares)
    verify(fmpAdapter, never()).fetch("GNS")
  }

  @Test
  fun `routes to the FMP adapter when the active provider is fmp`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER)).doReturn(ConfigKeys.PROVIDER_FMP)
    whenever(fmpAdapter.fetch("GNS")).doReturn(TickerFundamentals(9_000_000L, null))

    val f = router.fetch("GNS")

    assertEquals(9_000_000L, f.floatShares)
    verify(mockAdapter, never()).fetch("GNS")
  }

  @Test
  fun `degrades to EMPTY for a provider without a fundamentals adapter`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER))
      .doReturn(ConfigKeys.PROVIDER_POLYGON)

    assertEquals(TickerFundamentals.EMPTY, router.fetch("GNS"))
  }
}
