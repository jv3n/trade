package com.portfolioai.earnings.infrastructure.http

import com.portfolioai.earnings.application.EarningsService
import com.portfolioai.earnings.domain.EarningsReport
import com.portfolioai.earnings.domain.EarningsSnapshot
import com.portfolioai.earnings.domain.EarningsTime
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * `@WebMvcTest` slice for [EarningsController]. Four behaviours pinned :
 * - **URL + JSON shape** — `GET /api/market/ticker/{symbol}/earnings` lives under the same prefix
 *   as the rest of the ticker reads (chart, news, sector-benchmark, analyst-recommendations) so the
 *   front composes calls naturally. The JSON shape exposes the next-date + time-of-day
 *   enum-as-string + the reports list with EPS estimate / actual / surprise %.
 * - **No data → 404** : a `NoSuchElementException` from the service surfaces as HTTP 404 via
 *   [GlobalExceptionHandler], which the front renders as a "no earnings data" empty state distinct
 *   from a fetch error.
 * - **Provider unavailable → 503** : same convention as the analyst controller — the dossier
 *   "Fondamentaux" panel shows an inline error without blanking the rest of the page.
 * - **Calendar fail-soft → priceTarget=null analogue** : the JSON pins `nextEarningsDate` and
 *   `nextEarningsTime` as explicitly `null` (Jackson default `Include.ALWAYS`), so the front can
 *   reliably branch on the field rather than guessing absence.
 */
@WebMvcTest(EarningsController::class, GlobalExceptionHandler::class)
@AutoConfigureMockMvc(addFilters = false)
class EarningsControllerTest {

  @Autowired private lateinit var mvc: MockMvc

  @MockitoBean private lateinit var service: EarningsService

  @Test
  fun `GET earnings returns the snapshot with next-date, time and reports`() {
    given(service.forSymbol(eq("AAPL"))).willReturn(sampleSnapshot())

    mvc
      .perform(get("/api/market/ticker/AAPL/earnings"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.symbol").value("AAPL"))
      .andExpect(jsonPath("$.nextEarningsDate").value("2026-05-12"))
      .andExpect(jsonPath("$.nextEarningsTime").value("AFTER_MARKET"))
      .andExpect(jsonPath("$.lastReports.length()").value(2))
      .andExpect(jsonPath("$.lastReports[0].period").value("2025-09-30"))
      .andExpect(jsonPath("$.lastReports[0].epsEstimate").value(1.10))
      .andExpect(jsonPath("$.lastReports[0].epsActual").value(1.05))
      .andExpect(jsonPath("$.lastReports[0].surprisePercent").value(-4.55))
      .andExpect(jsonPath("$.lastReports[1].period").value("2025-12-31"))
      .andExpect(jsonPath("$.lastReports[1].surprisePercent").value(9.17))
  }

  @Test
  fun `GET earnings returns 404 when the symbol has no data`() {
    given(service.forSymbol(any())).willThrow(NoSuchElementException("No earnings data for AAPL"))

    mvc
      .perform(get("/api/market/ticker/AAPL/earnings"))
      .andExpect(status().isNotFound)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET earnings returns 503 when the upstream is unavailable`() {
    // Finnhub rate-limit / 5xx / unreachable — bubble up as UpstreamUnavailableException.
    given(service.forSymbol(any())).willThrow(UpstreamUnavailableException("rate-limited"))

    mvc
      .perform(get("/api/market/ticker/AAPL/earnings"))
      .andExpect(status().isServiceUnavailable)
      .andExpect(jsonPath("$.error").exists())
  }

  @Test
  fun `GET earnings returns the snapshot with next-date=null when the calendar is missing`() {
    // Finnhub /calendar/earnings sometimes 401s — the adapter swallows that to a null next-date.
    // The front renders the report breakdown without the countdown line. We pin the JSON shape :
    // `nextEarningsDate` and `nextEarningsTime` are explicitly null in the payload (Jackson
    // default `Include.ALWAYS`), so the front can reliably branch on the field rather than
    // guessing absence.
    given(service.forSymbol(eq("AAPL")))
      .willReturn(sampleSnapshot().copy(nextEarningsDate = null, nextEarningsTime = null))

    mvc
      .perform(get("/api/market/ticker/AAPL/earnings"))
      .andExpect(status().isOk)
      .andExpect(jsonPath("$.nextEarningsDate").value(nullValue()))
      .andExpect(jsonPath("$.nextEarningsTime").value(nullValue()))
      .andExpect(jsonPath("$.lastReports.length()").value(2))
  }

  // ---------------------------------------------------------------------- helpers

  private fun sampleSnapshot(): EarningsSnapshot =
    EarningsSnapshot(
      symbol = "AAPL",
      nextEarningsDate = LocalDate.parse("2026-05-12"),
      nextEarningsTime = EarningsTime.AFTER_MARKET,
      lastReports =
        listOf(
          EarningsReport(
            period = LocalDate.parse("2025-09-30"),
            epsEstimate = BigDecimal("1.10"),
            epsActual = BigDecimal("1.05"),
            surprisePercent = BigDecimal("-4.55"),
          ),
          EarningsReport(
            period = LocalDate.parse("2025-12-31"),
            epsEstimate = BigDecimal("1.20"),
            epsActual = BigDecimal("1.31"),
            surprisePercent = BigDecimal("9.17"),
          ),
        ),
    )
}
