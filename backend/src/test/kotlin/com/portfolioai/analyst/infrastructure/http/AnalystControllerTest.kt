package com.portfolioai.analyst.infrastructure.http

import com.portfolioai.analyst.application.AnalystRecommendationService
import com.portfolioai.analyst.domain.AnalystConsensus
import com.portfolioai.analyst.domain.AnalystSnapshot
import com.portfolioai.analyst.domain.MonthlyRecommendation
import com.portfolioai.analyst.domain.PriceTarget
import com.portfolioai.shared.GlobalExceptionHandler
import com.portfolioai.shared.UpstreamUnavailableException
import java.math.BigDecimal
import java.time.LocalDate
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [AnalystController]. Three behaviours pinned :
 * - **URL + JSON shape** — `GET /api/market/ticker/{symbol}/analyst-recommendations` lives under
 *   the same prefix as the rest of the ticker reads (chart, news, sector-benchmark) so the front
 *   composes calls naturally. The JSON shape exposes the breakdown + consensus + optional price
 *   target + history list.
 * - **No coverage → 404** : a `NoSuchElementException` from the service surfaces as HTTP 404 via
 *   [GlobalExceptionHandler], which the front renders as a "no analyst coverage" empty state
 *   distinct from a fetch error.
 * - **Provider unavailable → 503** : same convention as the news controller — the dossier "Fonda-
 *   mentaux" panel shows an inline error without blanking the rest of the page.
 */
@WebMvcTest(AnalystController::class, GlobalExceptionHandler::class)
class AnalystControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: AnalystRecommendationService

  @Test
  fun `GET analyst-recommendations returns the snapshot with breakdown, consensus, target and history`() {
    given(service.forSymbol(eq("AAPL"))).willReturn(sampleSnapshot())

    mvc
      .perform(get("/api/market/ticker/AAPL/analyst-recommendations"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("AAPL"))
      .andExpect(jsonPath("$.asOf").value("2026-04-01"))
      .andExpect(jsonPath("$.strongBuy").value(7))
      .andExpect(jsonPath("$.buy").value(5))
      .andExpect(jsonPath("$.hold").value(3))
      .andExpect(jsonPath("$.sell").value(1))
      .andExpect(jsonPath("$.strongSell").value(0))
      .andExpect(jsonPath("$.totalAnalysts").value(16))
      .andExpect(jsonPath("$.consensus").value("BUY"))
      .andExpect(jsonPath("$.priceTarget.high").value(280.00))
      .andExpect(jsonPath("$.priceTarget.numberOfAnalysts").value(41))
      .andExpect(jsonPath("$.history.length()").value(2))
      .andExpect(jsonPath("$.history[0].period").value("2026-03-01"))
  }

  @Test
  fun `GET analyst-recommendations returns 404 when the symbol has no coverage`() {
    given(service.forSymbol(any()))
      .willThrow(NoSuchElementException("No analyst coverage for AAPL"))

    mvc
      .perform(get("/api/market/ticker/AAPL/analyst-recommendations"))
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET analyst-recommendations returns 503 when the upstream is unavailable`() {
    // Finnhub rate-limit / 5xx / unreachable — bubble up as UpstreamUnavailableException.
    given(service.forSymbol(any())).willThrow(UpstreamUnavailableException("rate-limited"))

    mvc
      .perform(get("/api/market/ticker/AAPL/analyst-recommendations"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET analyst-recommendations returns the snapshot with priceTarget=null when the target is missing`() {
    // Finnhub /price-target sometimes 401s — the adapter swallows that to a null target. The front
    // renders the recommendation breakdown without the target line. We pin the JSON shape :
    // `priceTarget` is explicitly null in the payload (Jackson default `Include.ALWAYS`), so the
    // front can reliably branch on the field rather than guessing absence.
    given(service.forSymbol(eq("AAPL"))).willReturn(sampleSnapshot().copy(priceTarget = null))

    mvc
      .perform(get("/api/market/ticker/AAPL/analyst-recommendations"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.priceTarget").value(nullValue()))
      .andExpect(jsonPath("$.consensus").value("BUY"))
  }

  // ---------------------------------------------------------------------- helpers

  private fun sampleSnapshot(): AnalystSnapshot =
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
      priceTarget =
        PriceTarget(
          high = BigDecimal("280.00"),
          low = BigDecimal("175.00"),
          mean = BigDecimal("235.50"),
          median = BigDecimal("240.00"),
          numberOfAnalysts = 41,
        ),
      history =
        listOf(
          MonthlyRecommendation(
            period = LocalDate.parse("2026-03-01"),
            strongBuy = 6,
            buy = 5,
            hold = 4,
            sell = 1,
            strongSell = 0,
          ),
          MonthlyRecommendation(
            period = LocalDate.parse("2026-04-01"),
            strongBuy = 7,
            buy = 5,
            hold = 3,
            sell = 1,
            strongSell = 0,
          ),
        ),
    )
}
