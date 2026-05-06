package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.SectorBenchmark
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [RoutingSectorClassifier] — thin dispatcher with three behaviours pinned. Mock vs live
 * branch selection + defensive error on an unknown provider value.
 *
 * The "live" branch routes to **Finnhub** (not Twelve Data) when `market.provider=twelvedata`.
 * Reason : Twelve Data `/profile` is paid-tier on free accounts, making the sector feature
 * unusable. Finnhub `/stock/profile2` covers the same need on the free tier and the API key is
 * already configured for the news / analyst / earnings adapters. We keep the binary toggle (mock /
 * live) and document the implementation detail rather than introducing a separate `sector.provider`
 * runtime key — the test below pins this routing decision so an unknowing refactor doesn't silently
 * re-introduce the paid-tier dependency.
 */
class RoutingSectorClassifierTest {

  private val mock: SectorClassifier = mock()
  private val finnhub: SectorClassifier = mock()
  private val appConfig: AppConfigService = mock()

  private val sample = SectorBenchmark("Technology", "XLK", "Technology Select Sector SPDR Fund")

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.classify("AAPL")).doReturn(sample)

    val router = RoutingSectorClassifier(mock, finnhub, appConfig)
    val result = router.classify("AAPL")

    assertEquals(sample, result)
    verify(mock).classify("AAPL")
    verify(finnhub, never()).classify(any())
  }

  @Test
  fun `dispatches to Finnhub when provider is twelvedata (live mode)`() {
    // The toggle says `twelvedata`, but Twelve Data's /profile is paid-tier so we route to Finnhub
    // /stock/profile2 instead. The dispatcher abstracts this — pinned here so the routing decision
    // doesn't drift back to Twelve Data on a refactor.
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER))
      .doReturn(ConfigKeys.PROVIDER_TWELVEDATA)
    whenever(finnhub.classify("AAPL")).doReturn(sample)

    val router = RoutingSectorClassifier(mock, finnhub, appConfig)
    val result = router.classify("AAPL")

    assertEquals(sample, result)
    verify(finnhub).classify("AAPL")
    verify(mock, never()).classify(any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER)).doReturn("typo-provider")

    val router = RoutingSectorClassifier(mock, finnhub, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.classify("AAPL") }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
