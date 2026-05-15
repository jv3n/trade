package com.portfolioai.earnings.infrastructure.earnings

import com.portfolioai.config.application.AppConfigService
import com.portfolioai.config.application.ConfigKeys
import com.portfolioai.earnings.domain.EarningsClient
import com.portfolioai.earnings.domain.EarningsReport
import com.portfolioai.earnings.domain.EarningsSnapshot
import com.portfolioai.earnings.domain.EarningsTime
import java.math.BigDecimal
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
 * Tests on [RoutingEarningsClient]. Mirrors
 * [com.portfolioai.analyst.infrastructure.analyst.RoutingAnalystClientTest] — same three branches
 * (mock / finnhub / unknown). The routing decision happens per call so a runtime flip of
 * `earnings.provider` from `/settings/configuration` lands on the next dossier load without a
 * reboot.
 */
class RoutingEarningsClientTest {

  private val mock: EarningsClient = mock()
  private val finnhub: EarningsClient = mock()
  private val appConfig: AppConfigService = mock()

  private val sampleSnapshot =
    EarningsSnapshot(
      symbol = "AAPL",
      nextEarningsDate = LocalDate.parse("2026-05-12"),
      nextEarningsTime = EarningsTime.AFTER_MARKET,
      lastReports =
        listOf(
          EarningsReport(
            period = LocalDate.parse("2025-12-31"),
            epsEstimate = BigDecimal("1.20"),
            epsActual = BigDecimal("1.31"),
            surprisePercent = BigDecimal("9.17"),
          )
        ),
    )

  @Test
  fun `dispatches to the mock adapter when provider is mock`() {
    whenever(appConfig.getString(ConfigKeys.EARNINGS_PROVIDER)).doReturn(ConfigKeys.PROVIDER_MOCK)
    whenever(mock.fetch("AAPL")).doReturn(sampleSnapshot)

    val router = RoutingEarningsClient(mock, finnhub, appConfig)
    val result = router.fetch("AAPL")

    assertEquals(sampleSnapshot, result)
    verify(mock).fetch("AAPL")
    verify(finnhub, never()).fetch(org.mockito.kotlin.any())
  }

  @Test
  fun `dispatches to the finnhub adapter when provider is finnhub`() {
    whenever(appConfig.getString(ConfigKeys.EARNINGS_PROVIDER))
      .doReturn(ConfigKeys.PROVIDER_FINNHUB)
    whenever(finnhub.fetch("AAPL")).doReturn(sampleSnapshot)

    val router = RoutingEarningsClient(mock, finnhub, appConfig)
    val result = router.fetch("AAPL")

    assertEquals(sampleSnapshot, result)
    verify(finnhub).fetch("AAPL")
    verify(mock, never()).fetch(org.mockito.kotlin.any())
  }

  @Test
  fun `raises IllegalArgumentException on an unknown provider`() {
    whenever(appConfig.getString(ConfigKeys.EARNINGS_PROVIDER)).doReturn("typo-provider")

    val router = RoutingEarningsClient(mock, finnhub, appConfig)

    val ex = assertThrows<IllegalArgumentException> { router.fetch("AAPL") }
    assertTrue(ex.message?.contains("typo-provider") ?: false)
  }
}
