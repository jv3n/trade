package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.SectorBenchmark
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [RoutingSectorClassifier] — thin dispatcher with the same three behaviours pinned as
 * [RoutingMarketChartClient] and [RoutingSymbolSearchClient]. Mock vs Twelve Data branch selection
 * + defensive error on an unknown provider value.
 */
class RoutingSectorClassifierTest {

  private val mock: SectorClassifier = mock()
  private val twelveData: SectorClassifier = mock()
  private val appConfig: AppConfigService = mock()

  private val sample = SectorBenchmark("Technology", "XLK", "Technology Select Sector SPDR Fund")

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.classify("AAPL")).doReturn(sample)

    val router = RoutingSectorClassifier(mock, twelveData, appConfig)
    val result = router.classify("AAPL")

    assertEquals(sample, result)
    verify(mock).classify("AAPL")
    verify(twelveData, never()).classify(any())
  }

  @Test
  fun `dispatches to the twelvedata adapter when provider is twelvedata`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER))
      .doReturn(ConfigKeys.PROVIDER_TWELVEDATA)
    whenever(twelveData.classify("AAPL")).doReturn(sample)

    val router = RoutingSectorClassifier(mock, twelveData, appConfig)
    val result = router.classify("AAPL")

    assertEquals(sample, result)
    verify(twelveData).classify("AAPL")
    verify(mock, never()).classify(any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER)).doReturn("typo-provider")

    val router = RoutingSectorClassifier(mock, twelveData, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.classify("AAPL") }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
