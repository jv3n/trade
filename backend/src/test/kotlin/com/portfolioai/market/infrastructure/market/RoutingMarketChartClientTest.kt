package com.portfolioai.market.infrastructure.market

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.market.domain.MarketChart
import com.portfolioai.market.domain.MarketChartClient
import com.portfolioai.market.domain.TickerQuote
import java.math.BigDecimal
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Tests on [RoutingMarketChartClient]. The router is a thin dispatcher — each test pins one of
 * three behaviours :
 * - **Mock branch** is selected when `market.provider=mock`. The TwelveData adapter is *not*
 *   touched (no wasted credit on a misconfiguration).
 * - **Twelve Data branch** is selected when `market.provider=twelvedata`. The mock isn't called.
 * - **Unknown provider** raises `IllegalArgumentException` — defensive, since
 *   [AppConfigService.set] already validates the value at write time, but a typo in the YAML
 *   default or a forgotten DB row should still surface clearly rather than silently picking one.
 */
class RoutingMarketChartClientTest {

  private val mock: MarketChartClient = mock()
  private val twelveData: MarketChartClient = mock()
  private val appConfig: AppConfigService = mock()

  private val sampleChart =
    MarketChart(
      quote =
        TickerQuote(
          symbol = "AAPL",
          name = "Apple",
          currency = "USD",
          exchange = "NASDAQ",
          price = BigDecimal("180"),
          fiftyTwoWeekHigh = BigDecimal("200"),
          fiftyTwoWeekLow = BigDecimal("140"),
          asOf = Instant.parse("2026-05-04T10:00:00Z"),
          instrumentType = null,
        ),
      bars = emptyList(),
    )

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.fetchChart("AAPL", "1y", "1d")).doReturn(sampleChart)

    val router = RoutingMarketChartClient(mock, twelveData, appConfig)
    val result = router.fetchChart("AAPL", "1y", "1d")

    assertEquals(sampleChart, result)
    verify(mock).fetchChart("AAPL", "1y", "1d")
    verify(twelveData, never())
      .fetchChart(org.mockito.kotlin.any(), org.mockito.kotlin.any(), org.mockito.kotlin.any())
  }

  @Test
  fun `dispatches to the twelvedata adapter when provider is twelvedata`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER))
      .doReturn(ConfigKeys.PROVIDER_TWELVEDATA)
    whenever(twelveData.fetchChart("AAPL", "1y", "1d")).doReturn(sampleChart)

    val router = RoutingMarketChartClient(mock, twelveData, appConfig)
    val result = router.fetchChart("AAPL", "1y", "1d")

    assertEquals(sampleChart, result)
    verify(twelveData).fetchChart("AAPL", "1y", "1d")
    verify(mock, never())
      .fetchChart(org.mockito.kotlin.any(), org.mockito.kotlin.any(), org.mockito.kotlin.any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.MARKET_PROVIDER)).doReturn("typo-provider")

    val router = RoutingMarketChartClient(mock, twelveData, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.fetchChart("AAPL", "1y", "1d") }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
