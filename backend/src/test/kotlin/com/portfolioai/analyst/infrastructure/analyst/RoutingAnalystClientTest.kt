package com.portfolioai.analyst.infrastructure.analyst

import com.portfolioai.analyst.domain.AnalystConsensus
import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import java.time.LocalDate
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
 * Tests on [RoutingAnalystClient]. Mirrors
 * [com.portfolioai.news.infrastructure.news.RoutingNewsClientTest] — same three branches (mock /
 * finnhub / unknown). The routing decision happens per call so a runtime flip of `analyst.provider`
 * from `/settings/configuration` lands on the next dossier load without a reboot.
 */
class RoutingAnalystClientTest {

  private val mock: AnalystRecommendationClient = mock()
  private val finnhub: AnalystRecommendationClient = mock()
  private val appConfig: AppConfigService = mock()

  private val sampleSnapshot =
    AnalystSnapshot(
      symbol = "AAPL",
      asOf = LocalDate.parse("2026-04-01"),
      strongBuy = 7,
      buy = 5,
      hold = 3,
      sell = 1,
      strongSell = 0,
      totalAnalysts = 16,
      consensus = AnalystConsensus.BUY,
      priceTarget = null,
      history = emptyList(),
    )

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.ANALYST_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.fetch("AAPL")).doReturn(sampleSnapshot)

    val router = RoutingAnalystClient(mock, finnhub, appConfig)
    val result = router.fetch("AAPL")

    assertEquals(sampleSnapshot, result)
    verify(mock).fetch("AAPL")
    verify(finnhub, never()).fetch(org.mockito.kotlin.any())
  }

  @Test
  fun `dispatches to the finnhub adapter when provider is finnhub`() {
    whenever(appConfig.getString(ConfigKeys.ANALYST_PROVIDER)).doReturn(ConfigKeys.PROVIDER_FINNHUB)
    whenever(finnhub.fetch("AAPL")).doReturn(sampleSnapshot)

    val router = RoutingAnalystClient(mock, finnhub, appConfig)
    val result = router.fetch("AAPL")

    assertEquals(sampleSnapshot, result)
    verify(finnhub).fetch("AAPL")
    verify(mock, never()).fetch(org.mockito.kotlin.any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.ANALYST_PROVIDER)).doReturn("typo-provider")

    val router = RoutingAnalystClient(mock, finnhub, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.fetch("AAPL") }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
