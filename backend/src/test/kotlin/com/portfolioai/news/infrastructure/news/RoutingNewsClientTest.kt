package com.portfolioai.news.infrastructure.news

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.news.domain.NewsClient
import com.portfolioai.news.domain.NewsItem
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
 * Tests on [RoutingNewsClient]. Mirror of
 * [com.portfolioai.market.infrastructure.market.RoutingMarketChartClientTest] for the news side —
 * same three branches (mock / finnhub / unknown).
 */
class RoutingNewsClientTest {

  private val mock: NewsClient = mock()
  private val finnhub: NewsClient = mock()
  private val appConfig: AppConfigService = mock()

  private val sampleItems =
    listOf(
      NewsItem(
        id = "1",
        symbol = "AAPL",
        headline = "h",
        summary = null,
        source = "Reuters",
        url = "https://example.com",
        imageUrl = null,
        publishedAt = Instant.parse("2026-05-04T10:00:00Z"),
        category = null,
      )
    )

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.NEWS_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.fetchNews("AAPL", 10)).doReturn(sampleItems)

    val router = RoutingNewsClient(mock, finnhub, appConfig)
    val result = router.fetchNews("AAPL", 10)

    assertEquals(sampleItems, result)
    verify(mock).fetchNews("AAPL", 10)
    verify(finnhub, never()).fetchNews(org.mockito.kotlin.any(), org.mockito.kotlin.any())
  }

  @Test
  fun `dispatches to the finnhub adapter when provider is finnhub`() {
    whenever(appConfig.getString(ConfigKeys.NEWS_PROVIDER)).doReturn(ConfigKeys.PROVIDER_FINNHUB)
    whenever(finnhub.fetchNews("AAPL", 10)).doReturn(sampleItems)

    val router = RoutingNewsClient(mock, finnhub, appConfig)
    val result = router.fetchNews("AAPL", 10)

    assertEquals(sampleItems, result)
    verify(finnhub).fetchNews("AAPL", 10)
    verify(mock, never()).fetchNews(org.mockito.kotlin.any(), org.mockito.kotlin.any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.NEWS_PROVIDER)).doReturn("typo-provider")

    val router = RoutingNewsClient(mock, finnhub, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.fetchNews("AAPL", 10) }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
