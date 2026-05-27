package com.portfolioai.screener.infrastructure.screener

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.screener.domain.MarketScreenerClient
import com.portfolioai.screener.domain.ScreenerUniverse
import com.portfolioai.screener.domain.TickerMover
import java.math.BigDecimal
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
 * Tests on [RoutingMarketScreenerClient]. Four behaviours pinned :
 * - **Mock branch** is selected when `screener.provider=mock`. The Polygon + FMP adapters are *not*
 *   touched (no wasted free-tier request on a misconfiguration).
 * - **Polygon branch** is selected when `screener.provider=polygon`. The mock + FMP aren't called.
 * - **FMP branch** is selected when `screener.provider=fmp`. The mock + Polygon aren't called.
 * - **Unknown provider** raises `IllegalArgumentException` — defensive, since
 *   [AppConfigService.set] already validates the value at write time, but a typo in the YAML
 *   default or a stray DB row should still surface clearly rather than silently picking one.
 */
class RoutingMarketScreenerClientTest {

  private val mock: MarketScreenerClient = mock()
  private val polygon: MarketScreenerClient = mock()
  private val fmp: MarketScreenerClient = mock()
  private val appConfig: AppConfigService = mock()

  private val sample =
    listOf(
      TickerMover(
        symbol = "AAPL",
        name = "AAPL",
        price = BigDecimal("180"),
        previousClose = BigDecimal("170"),
        gapPct = BigDecimal("5.88"),
        volume = 50_000_000L,
        volumeAvg30d = 40_000_000L,
        volumeRatio = BigDecimal("1.25"),
        marketCapUsd = 0L,
        exchange = "",
        sector = null,
      )
    )

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)).doReturn(sample)

    val router = RoutingMarketScreenerClient(mock, polygon, fmp, appConfig)
    val result = router.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertEquals(sample, result)
    verify(mock).snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    verify(polygon, never()).snapshotMovers(any())
    verify(fmp, never()).snapshotMovers(any())
  }

  @Test
  fun `dispatches to the polygon adapter when provider is polygon`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER))
      .doReturn(ConfigKeys.PROVIDER_POLYGON)
    whenever(polygon.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)).doReturn(sample)

    val router = RoutingMarketScreenerClient(mock, polygon, fmp, appConfig)
    val result = router.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertEquals(sample, result)
    verify(polygon).snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    verify(mock, never()).snapshotMovers(any())
    verify(fmp, never()).snapshotMovers(any())
  }

  @Test
  fun `dispatches to the fmp adapter when provider is fmp`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER)).doReturn(ConfigKeys.PROVIDER_FMP)
    whenever(fmp.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)).doReturn(sample)

    val router = RoutingMarketScreenerClient(mock, polygon, fmp, appConfig)
    val result = router.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)

    assertEquals(sample, result)
    verify(fmp).snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
    verify(mock, never()).snapshotMovers(any())
    verify(polygon, never()).snapshotMovers(any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.SCREENER_PROVIDER)).doReturn("typo-provider")

    val router = RoutingMarketScreenerClient(mock, polygon, fmp, appConfig)

    val ex =
      assertThrows<IllegalArgumentException> {
        router.snapshotMovers(ScreenerUniverse.NASDAQ_MID_CAP)
      }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
